export default {
  async fetch(request, env) {
    const requestOrigin = (request.headers.get("Origin") || "").trim();
    const allowOrigin = requestOrigin || "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Vary": "Origin",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Payload invalide" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const clean = (v, max = 200) =>
      String(v || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, max);

    const fullname = clean(body.fullname, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 160).toLowerCase();
    const subject = clean(body.subject, 200);
    const message = clean(body.message, 1200);
    const website = clean(body.website, 80);
    const formTs = Number(body.form_ts || 0);
    const formAge = Date.now() - formTs;

    if (website) {
      return new Response(JSON.stringify({ ok: true, message: "Message envoye avec succes" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (!Number.isFinite(formTs) || formAge < 2000 || formAge > 1000 * 60 * 60 * 2) {
      return new Response(JSON.stringify({ ok: false, error: "Validation temporelle invalide" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    if (!fullname || fullname.length < 2) {
      return new Response(JSON.stringify({ ok: false, error: "Nom invalide" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    if (!/^[0-9+().\s-]{6,30}$/.test(phone)) {
      return new Response(JSON.stringify({ ok: false, error: "Telephone invalide" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, error: "Email invalide" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    if (!subject || subject.length < 2) {
      return new Response(JSON.stringify({ ok: false, error: "Sujet invalide" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    const combined = [fullname, phone, subject, message].join(" ");
    if (/https?:\/\//i.test(combined) || /(?:viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans)/i.test(combined) || /(.)\1{9,}/.test(combined)) {
      return new Response(JSON.stringify({ ok: false, error: "Message rejete (spam)" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    const html = `
      <h2>Nouvelle demande TTBAT</h2>
      <p><strong>Nom:</strong> ${fullname}</p>
      <p><strong>Telephone:</strong> ${phone}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Sujet:</strong> ${subject}</p>
      <p><strong>Message:</strong><br>${message.replace(/\n/g, "<br>")}</p>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [env.CONTACT_TO || "ttbatiso@gmail.com"],
        reply_to: [email],
        subject: `[TTBAT] ${subject}`,
        html,
        text: `Nom: ${fullname}\nTelephone: ${phone}\nEmail: ${email}\nSujet: ${subject}\n\n${message}`,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      return new Response(JSON.stringify({ ok: false, error: `Resend error ${resendRes.status}: ${detail}` }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true, message: "Message envoye avec succes" }), {
      status: 200,
      headers: corsHeaders,
    });
  },
};
