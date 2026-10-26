function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function paymentConfirmationEmailHtml(order: {
  full_name: string;
  whatsapp: string;
  ticket_category: string;
  quantity: number;
  total_price: number;
}, event: {
  title: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  location: string | null;
}, accessCode: string, ticketPageUrl: string, isFreePass = false) {
  const name = escapeHtml(order.full_name);
  const eventTitle = event.title.replace(/[\r\n]+/g, ' ').trim();
  const escapedEventTitle = escapeHtml(eventTitle);
  const category = escapeHtml(order.ticket_category);
  const whatsapp = escapeHtml(order.whatsapp);
  const code = escapeHtml(accessCode);
  const ticketUrl = escapeHtml(ticketPageUrl);
  const logoUrl = escapeHtml(new URL('/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png', ticketPageUrl).toString());
  const total = `Rp ${order.total_price.toLocaleString('id-ID')}`;
  const parsedDate = event.date ? Date.parse(`${event.date}T00:00:00Z`) : Number.NaN;
  const eventDate = Number.isNaN(parsedDate)
    ? ''
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsedDate);
  const eventTime = event.time?.trim() ?? '';
  const eventLocation = [event.venue?.trim(), event.location?.trim()]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(' · ');
  const detailRow = (label: string, value: string, last = false, emphasize = false) => `
    <tr>
      <td style="padding:${last ? '13px 0 5px' : '9px 0'};color:#64748b;${last ? '' : 'border-bottom:1px solid #edf1f6;'}width:42%">${label}</td>
      <td style="padding:${last ? '13px 0 5px' : '9px 0'};color:${emphasize ? '#102a56' : '#172033'};font-weight:700;${last ? 'font-size:18px;line-height:24px;' : 'border-bottom:1px solid #edf1f6;'}">${value}</td>
    </tr>`;
  const eventRows = [
    eventDate ? detailRow('Tanggal', escapeHtml(eventDate)) : '',
    eventTime ? detailRow('Waktu', escapeHtml(eventTime)) : '',
    eventLocation ? detailRow('Lokasi', escapeHtml(eventLocation)) : '',
  ].join('');
  const paymentRow = isFreePass ? '' : detailRow('Total pembayaran', total, true, true);
  const intro = isFreePass
    ? `Halo <strong style="color:#172033">${name}</strong>, kamu mendapatkan tiket Free Pass untuk <strong style="color:#172033">${escapedEventTitle}</strong>.`
    : `Halo <strong style="color:#172033">${name}</strong>, pembayaran tiket kamu sudah dikonfirmasi dan berstatus <strong style="color:#16834a">LUNAS</strong>.`;
  const statusLabel = isFreePass ? 'FREE PASS' : 'PAYMENT SUCCESS';
  const heading = isFreePass ? 'Free Pass Berhasil!' : 'Pembayaran Berhasil!';
  const detailStatus = isFreePass ? '● FREE PASS' : '● TERKONFIRMASI';
  const preheader = isFreePass
    ? `Kamu mendapatkan tiket Free Pass untuk ${eventTitle}.`
    : 'Pembayaran tiket kamu sudah dikonfirmasi dan berstatus lunas.';

  return {
    subject: `Pembayaran Tiket ${eventTitle} Berhasil — Lunas`,
    html: `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${isFreePass ? 'Free Pass' : 'Pembayaran Berhasil'} - Standupindo Cilegon</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;margin:0;padding:24px 0">
    <tr><td align="center" style="padding:0 12px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fff;border-radius:18px;overflow:hidden">
        <tr><td style="padding:24px 28px;background-color:#fff;border-bottom:1px solid #e7edf5">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle" style="width:58px"><img src="${logoUrl}" width="52" height="52" alt="Standupindo Cilegon" style="display:block;width:52px;height:52px;object-fit:contain;border:0"></td>
            <td valign="middle" style="padding-left:12px"><div style="font-size:17px;line-height:22px;font-weight:800;color:#102a56">STANDUPINDO</div><div style="font-size:11px;line-height:17px;letter-spacing:1.4px;color:#64748b">CILEGON · OFFICIAL TICKETING</div></td>
            <td align="right" valign="middle"><span style="display:inline-block;padding:8px 10px;border-radius:20px;background-color:${isFreePass ? '#fff7df' : '#e8f8ef'};color:${isFreePass ? '#9a6700' : '#16834a'};font-size:10px;line-height:12px;font-weight:800;letter-spacing:.5px">${statusLabel}</span></td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:34px 28px 28px">
          <div style="width:54px;height:54px;line-height:54px;border-radius:50%;background-color:#e7f8ee;color:#169653;font-size:30px;font-weight:700;text-align:center;margin:0 auto 18px">✓</div>
          <h1 style="margin:0 0 12px;font-size:27px;line-height:34px;color:#102a56">${heading}</h1>
          <p style="margin:0;max-width:440px;font-size:15px;line-height:24px;color:#526176">${intro}</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2eaf4;border-radius:14px;overflow:hidden">
            <tr><td style="padding:18px 20px;background-color:#f8fbff;border-bottom:1px solid #e2eaf4">
              <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.2px;color:#64748b;margin-bottom:5px">DETAIL TIKET</div>
              <div style="font-size:19px;line-height:26px;font-weight:800;color:#102a56">${escapedEventTitle}</div>
              <div style="margin-top:10px"><span style="display:inline-block;padding:6px 10px;border-radius:20px;background-color:${isFreePass ? '#fff7df' : '#e8f8ef'};color:${isFreePass ? '#9a6700' : '#16834a'};font-size:10px;line-height:12px;font-weight:800;letter-spacing:.5px">${detailStatus}</span></div>
            </td></tr>
            <tr><td style="padding:8px 20px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:13px;line-height:19px">
              ${detailRow('Nama pemesan', name)}${eventRows}${detailRow('Kategori', category)}${detailRow('Jumlah tiket', String(order.quantity))}${paymentRow}
            </table></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0c205f;border-radius:14px"><tr><td style="padding:20px">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:6px"><tr>
              <td valign="middle" style="width:36px;height:36px;border-radius:9px;background-color:#24477f;text-align:center;font-size:17px;line-height:36px">🔑</td>
              <td valign="middle" style="padding-left:10px;font-size:16px;line-height:22px;color:#fff;font-weight:800">Akses Tiket Digital</td>
            </tr></table>
            <div style="font-size:13px;line-height:20px;color:#80c5ff;margin-bottom:16px">Gunakan nomor WhatsApp &amp; kode akses berikut untuk membuka tiket digital kamu di website.</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="top" width="49%" style="padding:12px;background-color:#020d38;border:1px solid #18336f;border-radius:13px"><div style="font-size:10px;line-height:15px;color:#72bdf6;font-weight:800;letter-spacing:.6px;margin-bottom:4px">NOMOR WHATSAPP</div><div style="font-size:15px;line-height:21px;color:#fff;font-weight:800;letter-spacing:.4px;word-break:break-word">${whatsapp}</div></td>
              <td width="2%" style="width:2%;font-size:0;line-height:0">&nbsp;</td>
              <td valign="top" width="49%" style="padding:12px;background-color:#1b4d84;border:1px solid #4d91c3;border-radius:13px"><div style="font-size:10px;line-height:15px;color:#72c5ff;font-weight:800;letter-spacing:.6px;margin-bottom:4px">KODE AKSES TIKET</div><div style="font-size:15px;line-height:21px;color:#ffc229;font-weight:900;letter-spacing:1px;word-break:break-word">${code}</div></td>
            </tr></table>
          </td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 32px">
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#526176">Tiket kamu sudah siap. Buka halaman <strong>Tiket Saya</strong> untuk melihat tiket digital.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#1264e8" style="border-radius:9px"><a href="${ticketUrl}" style="display:inline-block;padding:14px 28px;border-radius:9px;background-color:#1264e8;color:#fff;text-decoration:none;font-size:14px;line-height:18px;font-weight:800">Buka Tiket Saya&nbsp; →</a></td></tr></table>
          <p style="margin:18px 0 0;font-size:11px;line-height:18px;color:#7b8798">Jika tombol tidak dapat dibuka, gunakan tautan berikut:<br><a href="${ticketUrl}" style="color:#1264e8;text-decoration:underline;word-break:break-word">${ticketUrl}</a></p>
        </td></tr>
        <tr><td style="padding:20px 28px;background-color:#f8fbff;border-top:1px solid #e7edf5"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td valign="middle" style="width:44px"><img src="${logoUrl}" width="38" height="38" alt="Standupindo" style="display:block;width:38px;height:38px;object-fit:contain;border:0"></td>
          <td valign="middle" style="padding-left:10px"><div style="font-size:12px;line-height:18px;color:#64748b">Official Ticketing</div><div style="font-size:13px;line-height:19px;color:#102a56;font-weight:800">Standupindo Cilegon</div></td>
          <td align="right" valign="middle" style="font-size:10px;line-height:16px;color:#94a3b8">Email otomatis<br>Mohon tidak membalas email ini.</td>
        </tr></table></td></tr>
      </table>
      <div style="max-width:560px;padding:16px 8px 0;font-size:10px;line-height:16px;color:#94a3b8;text-align:center">© Standupindo Cilegon · Official Ticketing</div>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Halo ${order.full_name}, pembayaran tiket ${eventTitle} sudah dikonfirmasi dan berstatus lunas.\n\nDetail Tiket:\nEvent: ${eventTitle}\nNama pemesan: ${order.full_name}\n${eventDate ? `Tanggal: ${eventDate}\n` : ''}${eventTime ? `Waktu: ${eventTime}\n` : ''}${eventLocation ? `Lokasi: ${eventLocation}\n` : ''}Kategori: ${order.ticket_category}\nJumlah tiket: ${order.quantity}\nTotal pembayaran: ${total}\n\nAkses Tiket:\nNomor WhatsApp: ${order.whatsapp}\nKode Akses: ${accessCode}\n\nBuka Tiket Saya: ${ticketPageUrl}\n\nSTANDUPINDO CILEGON`,
  };
}