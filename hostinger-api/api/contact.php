<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (is_file(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
}

function loadLocalConfig(string $filePath): array
{
    if (!is_file($filePath)) {
        return [];
    }
    $rows = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($rows)) {
        return [];
    }
    $out = [];
    foreach ($rows as $row) {
        $line = trim((string)$row);
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $key = trim($parts[0]);
        $val = trim($parts[1]);
        if ($key !== '') {
            $out[$key] = $val;
        }
    }
    return $out;
}

function smtpReadLine($socket): string
{
    $line = fgets($socket, 515);
    return $line === false ? '' : (string)$line;
}

function smtpReadResponse($socket): string
{
    $response = '';
    while (true) {
        $line = smtpReadLine($socket);
        if ($line === '') {
            break;
        }
        $response .= $line;
        if (strlen($line) < 4 || $line[3] !== '-') {
            break;
        }
    }
    return $response;
}

function smtpExpect($socket, array $expectedCodes): bool
{
    $response = smtpReadResponse($socket);
    if ($response === '') {
        return false;
    }
    $code = (int)substr($response, 0, 3);
    return in_array($code, $expectedCodes, true);
}

function smtpWrite($socket, string $line): bool
{
    return fwrite($socket, $line . "\r\n") !== false;
}

function smtpSendNative(
    string $host,
    int $port,
    string $secure,
    string $username,
    string $password,
    string $fromEmail,
    string $fromName,
    string $to,
    string $replyTo,
    string $subject,
    string $body
): bool {
    if ($host === '' || $username === '' || $password === '') {
        return false;
    }

    $secureMode = strtolower(trim($secure));
    $remote = ($secureMode === 'ssl' || $secureMode === 'smtps')
        ? 'ssl://' . $host . ':' . $port
        : 'tcp://' . $host . ':' . $port;

    $socket = @stream_socket_client($remote, $errno, $errstr, 12, STREAM_CLIENT_CONNECT);
    if ($socket === false) {
        return false;
    }

    stream_set_timeout($socket, 12);

    if (!smtpExpect($socket, [220])) {
        fclose($socket);
        return false;
    }

    if (!smtpWrite($socket, 'EHLO ttbat.fr') || !smtpExpect($socket, [250])) {
        fclose($socket);
        return false;
    }

    if ($secureMode === 'tls' || $secureMode === 'starttls') {
        if (!smtpWrite($socket, 'STARTTLS') || !smtpExpect($socket, [220])) {
            fclose($socket);
            return false;
        }
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($socket);
            return false;
        }
        if (!smtpWrite($socket, 'EHLO ttbat.fr') || !smtpExpect($socket, [250])) {
            fclose($socket);
            return false;
        }
    }

    if (!smtpWrite($socket, 'AUTH LOGIN') || !smtpExpect($socket, [334])) {
        fclose($socket);
        return false;
    }
    if (!smtpWrite($socket, base64_encode($username)) || !smtpExpect($socket, [334])) {
        fclose($socket);
        return false;
    }
    if (!smtpWrite($socket, base64_encode($password)) || !smtpExpect($socket, [235])) {
        fclose($socket);
        return false;
    }

    if (!smtpWrite($socket, 'MAIL FROM:<' . $fromEmail . '>') || !smtpExpect($socket, [250])) {
        fclose($socket);
        return false;
    }
    if (!smtpWrite($socket, 'RCPT TO:<' . $to . '>') || !smtpExpect($socket, [250, 251])) {
        fclose($socket);
        return false;
    }
    if (!smtpWrite($socket, 'DATA') || !smtpExpect($socket, [354])) {
        fclose($socket);
        return false;
    }

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers = [
        'From: ' . $fromName . ' <' . $fromEmail . '>',
        'To: ' . $to,
        'Reply-To: ' . $replyTo,
        'Subject: ' . $encodedSubject,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];

    $normalizedBody = str_replace(["\r\n", "\r"], "\n", $body);
    $normalizedBody = preg_replace('/\n\./', "\n..", $normalizedBody) ?? $normalizedBody;
    $data = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $normalizedBody) . "\r\n.";
    if (!smtpWrite($socket, $data) || !smtpExpect($socket, [250])) {
        fclose($socket);
        return false;
    }

    smtpWrite($socket, 'QUIT');
    fclose($socket);
    return true;
}

function resendSend(
    string $apiKey,
    string $from,
    string $to,
    string $replyTo,
    string $subject,
    string $textBody,
    string $htmlBody
): bool {
    if ($apiKey === '' || $from === '' || $to === '') {
        return false;
    }

    $payload = [
        'from' => $from,
        'to' => [$to],
        'subject' => $subject,
        'text' => $textBody,
        'html' => $htmlBody,
        'reply_to' => [$replyTo],
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if (!is_string($json)) {
        return false;
    }

    // Prefer cURL when available.
    if (function_exists('curl_init')) {
        $ch = curl_init('https://api.resend.com/emails');
        if ($ch === false) {
            return false;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $json,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($response === false) {
            return false;
        }
        return $httpCode >= 200 && $httpCode < 300;
    }

    // Fallback via stream context.
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 15,
            'header' => "Authorization: Bearer {$apiKey}\r\nContent-Type: application/json\r\n",
            'content' => $json,
        ],
    ]);
    $result = @file_get_contents('https://api.resend.com/emails', false, $context);
    if ($result === false) {
        return false;
    }

    $statusLine = '';
    if (isset($http_response_header) && is_array($http_response_header) && isset($http_response_header[0])) {
        $statusLine = (string)$http_response_header[0];
    }
    return strpos($statusLine, ' 2') !== false;
}

$cfg = loadLocalConfig(__DIR__ . '/.contact.env');

$allowedOrigins = [
    'https://ttbat.fr',
    'https://www.ttbat.fr',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$isAllowedOrigin = in_array($origin, $allowedOrigins, true);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (!$isAllowedOrigin) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Origine non autorisee'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($origin !== '' && !$isAllowedOrigin) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Origine non autorisee'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($isAllowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

$contentType = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
if (strpos($contentType, 'application/json') === false) {
    http_response_code(415);
    echo json_encode(['ok' => false, 'error' => 'Type de contenu invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '{}', true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Payload invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

$clean = static function ($value, int $max = 200): string {
    $txt = trim((string)($value ?? ''));
    $txt = preg_replace('/\s+/u', ' ', $txt) ?? $txt;
    return mb_substr($txt, 0, $max);
};

$fullname = $clean($data['fullname'] ?? '', 120);
$phone = $clean($data['phone'] ?? '', 40);
$email = strtolower($clean($data['email'] ?? '', 160));
$subject = $clean($data['subject'] ?? '', 200);
$message = $clean($data['message'] ?? '', 1200);
$website = $clean($data['website'] ?? '', 80);
$formTs = (int)($data['form_ts'] ?? 0);
$formAge = (int)round(microtime(true) * 1000) - $formTs;

if ($website !== '') {
    echo json_encode(['ok' => true, 'message' => 'Message envoye avec succes'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($formTs <= 0 || $formAge < 2000 || $formAge > 7200000) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Validation temporelle invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($fullname) < 2) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Nom invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!preg_match('/^[0-9+().\s-]{6,30}$/', $phone)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Telephone invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Email invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($subject) < 2) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Sujet invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

$spamRegex = '/https?:\/\/|viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans|(.)\\1{9,}/iu';
if (preg_match($spamRegex, implode(' ', [$fullname, $phone, $subject, $message]))) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Message rejete (spam)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$to = trim((string)($cfg['CONTACT_TO'] ?? 'eymeric.plaisant@gmail.com'));
$fromEmail = trim((string)($cfg['MAIL_FROM'] ?? 'no-reply@ttbat.fr'));
$fromName = trim((string)($cfg['MAIL_FROM_NAME'] ?? 'TTBAT'));
$smtpHost = trim((string)($cfg['SMTP_HOST'] ?? ''));
$smtpPort = (int)($cfg['SMTP_PORT'] ?? 587);
$smtpUser = trim((string)($cfg['SMTP_USER'] ?? ''));
$smtpPass = trim((string)($cfg['SMTP_PASS'] ?? ''));
$smtpSecure = strtolower(trim((string)($cfg['SMTP_SECURE'] ?? 'tls')));
$resendApiKey = trim((string)($cfg['RESEND_API_KEY'] ?? ''));
$resendFrom = trim((string)($cfg['RESEND_FROM'] ?? ''));
$resendOnly = strtolower(trim((string)($cfg['RESEND_ONLY'] ?? 'false'))) === 'true';
$dateText = date('d/m/Y H:i:s');
$mailSubject = '[TTBAT] ' . $subject;
$mailText = "NOUVELLE DEMANDE TTBAT\n\n"
    . "Nom : {$fullname}\n"
    . "Telephone : {$phone}\n"
    . "Email : {$email}\n"
    . "Sujet : {$subject}\n"
    . ($message !== '' ? "\nMessage :\n{$message}\n" : '')
    . "\n{$dateText}\n";

$mailHtml = '<h2>Nouvelle demande TTBAT</h2>'
    . '<p><strong>Nom :</strong> ' . htmlspecialchars($fullname, ENT_QUOTES, 'UTF-8') . '</p>'
    . '<p><strong>Telephone :</strong> ' . htmlspecialchars($phone, ENT_QUOTES, 'UTF-8') . '</p>'
    . '<p><strong>Email :</strong> ' . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . '</p>'
    . '<p><strong>Sujet :</strong> ' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</p>'
    . '<p><strong>Message :</strong><br>' . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) . '</p>'
    . '<p><strong>Date :</strong> ' . htmlspecialchars($dateText, ENT_QUOTES, 'UTF-8') . '</p>';

$headers = [
    'From: ' . $fromName . ' <' . $fromEmail . '>',
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . phpversion(),
];

$sent = false;

if ($resendApiKey !== '' && $resendFrom !== '') {
    $sent = resendSend(
        $resendApiKey,
        $resendFrom,
        $to,
        $email,
        $mailSubject,
        $mailText,
        $mailHtml
    );
}

if (!$sent && $resendOnly) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Erreur envoi email (Resend)'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (
    !$sent &&
    class_exists('PHPMailer\\PHPMailer\\PHPMailer')
    && $smtpHost !== ''
    && $smtpUser !== ''
    && $smtpPass !== ''
) {
    try {
        $mailer = new PHPMailer\PHPMailer\PHPMailer(true);
        $mailer->isSMTP();
        $mailer->Host = $smtpHost;
        $mailer->Port = $smtpPort > 0 ? $smtpPort : 587;
        $mailer->SMTPAuth = true;
        $mailer->Username = $smtpUser;
        $mailer->Password = $smtpPass;
        if ($smtpSecure === 'ssl') {
            $mailer->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mailer->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        }
        $mailer->CharSet = 'UTF-8';
        $mailer->setFrom($fromEmail, $fromName);
        $mailer->addAddress($to);
        $mailer->addReplyTo($email, $fullname);
        $mailer->Subject = $mailSubject;
        $mailer->Body = $mailText;
        $sent = $mailer->send();
    } catch (Throwable $e) {
        $sent = false;
    }
}

if (!$sent) {
    $sent = smtpSendNative(
        $smtpHost,
        $smtpPort > 0 ? $smtpPort : 587,
        $smtpSecure,
        $smtpUser,
        $smtpPass,
        $fromEmail,
        $fromName,
        $to,
        $email,
        $mailSubject,
        $mailText
    );
}

if (!$sent) {
    $sent = @mail($to, $mailSubject, $mailText, implode("\r\n", $headers));
}
if (!$sent) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Erreur envoi email'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['ok' => true, 'message' => 'Message envoye avec succes'], JSON_UNESCAPED_UNICODE);
