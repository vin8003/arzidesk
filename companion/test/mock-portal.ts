import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Stand-ins for rtionline.gov.in, its payment gateway and pmkisan.gov.in.
 * The status and payment-reconciliation forms copy the real markup (captured
 * 17 Oct 2026). The email check, OTP pages, request form, gateway and
 * results are SIMULATED from the portal's own guidelines and FAQ; they are
 * test doubles, not a record of the live pages.
 */

export const CAPTCHA = "K7Q2PX";
export const OTP = "246810";
export const REG_NO = "DOPAT/R/E/26/00042";

export type MockOptions = {
  /** Rename the request text label, as a portal redesign would. */
  renameTextLabel?: boolean;
  /** After payment, show "will be generated after reconciliation" instead of a number. */
  pendingAfterPayment?: boolean;
};

export type Mock = {
  rti: string;
  gateway: string;
  pmkisan: string;
  submitted: Record<string, string>[];
  set(opts: MockOptions): void;
  close(): Promise<void>;
};

const head = (title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><div id="nav">HomeSubmit RequestSubmit First AppealView StatusView HistoryLogin</div>`;
const foot = `<div>Home | National Portal of India | FAQ</div></body></html>`;
const captchaRow = `<tr><th><samp style="color:#FF0000"><b>*</b></samp> Enter Security code</th> <td> <img src="/captcha_code_file.php" id="captchaimg" class="captcha" alt="captchaImage" data-test-code="${CAPTCHA}"> <input type="text" name="6_letters_code" id="6_letters_code" maxlength="10" autocomplete="off"> <b style="color:red">(All Characters are Case insensitive)</b></td></tr>`;

async function body(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  const ct = req.headers["content-type"] ?? "";
  if (ct.includes("multipart/form-data")) {
    const boundary = /boundary=(.+)$/.exec(ct)?.[1] ?? "";
    const out: Record<string, string> = {};
    for (const part of raw.split(`--${boundary}`)) {
      const name = /name="([^"]+)"/.exec(part)?.[1];
      if (!name) continue;
      const file = /filename="([^"]*)"/.exec(part)?.[1];
      const value = part.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
      out[name] = file !== undefined ? `file:${file}` : value;
    }
    return out;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function send(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(302, { Location: to });
  res.end();
}

function listen(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      res.writeHead(500);
      res.end(String(err));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

const MINISTRIES = [
  "Department of Agriculture and Farmers Welfare",
  "Department of Agricultural Research and Education",
  "Ministry of Rural Development",
  "Department of Personnel and Training",
];
const AUTHORITIES: Record<string, string[]> = {
  "Department of Agriculture and Farmers Welfare": ["Department of Agriculture and Farmers Welfare", "PM-Kisan Samman Nidhi Division"],
  "Ministry of Rural Development": ["Department of Rural Development", "National Rural Livelihood Mission"],
};

function requestForm(opts: MockOptions, email: string, error = ""): string {
  const textLabel = opts.renameTextLabel ? "Details of information sought" : "Text for RTI Request application";
  return `${head("RTI Online :: Online RTI Request Form")}
  <h2>Online RTI Request Form</h2>
  ${error ? `<p style="color:red" id="err">${error}</p>` : ""}
  <form name="FrmRequest" action="/request/request_submit.php" method="post" enctype="multipart/form-data">
  <table class="login-tab"><tbody>
    <tr><th><samp>*</samp> Select Ministry/Department/Apex Body</th><td><select name="Ministry" id="Ministry"><option value="">--Select--</option>${MINISTRIES.map((m) => `<option>${m}</option>`).join("")}</select></td></tr>
    <tr><th><samp>*</samp> Public Authority</th><td><select name="PA" id="PA"><option value="">--Select--</option></select></td></tr>
    <tr><th><samp>*</samp> Name</th><td><input type="text" name="Name" id="Name"></td></tr>
    <tr><th><samp>*</samp> Gender</th><td><label><input type="radio" name="gender" value="M">Male</label> <label><input type="radio" name="gender" value="F">Female</label> <label><input type="radio" name="gender" value="T">Third Gender</label></td></tr>
    <tr><th><samp>*</samp> Address</th><td><textarea name="address" id="address"></textarea></td></tr>
    <tr><th><samp>*</samp> Pincode</th><td><input type="text" name="pincode" maxlength="6" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6)"></td></tr>
    <tr><th><samp>*</samp> Country</th><td><select name="country"><option value="">--Select--</option><option>India</option><option>Other</option></select></td></tr>
    <tr><th><samp>*</samp> State</th><td><select name="state"><option value="">--Select--</option><option>Delhi</option><option>Madhya Pradesh</option><option>Rajasthan</option><option>Uttar Pradesh</option></select></td></tr>
    <tr><th><samp>*</samp> Status</th><td><label><input type="radio" name="status" value="R">Rural</label> <label><input type="radio" name="status" value="U">Urban</label></td></tr>
    <tr><th><samp>*</samp> Educational Status</th><td><label><input type="radio" name="edu" value="L">Literate</label> <label><input type="radio" name="edu" value="I">Illiterate</label>
      <select name="education" id="education"><option value="">--Select--</option><option>Below 12th</option><option>12th Pass</option><option>Graduate</option><option>Above Graduate</option></select></td></tr>
    <tr><th>Phone Number</th><td><input type="text" name="phone"></td></tr>
    <tr><th>Mobile Number</th><td><input type="text" name="mobile" maxlength="10"></td></tr>
    <tr><th><samp>*</samp> Email-ID</th><td><input type="text" name="email" value="${email}" readonly></td></tr>
    <tr><th><samp>*</samp> Citizenship</th><td><select name="citizenship"><option>Indian</option></select></td></tr>
    <tr><th><samp>*</samp> Is the Requester Below Poverty Line ?</th><td><label><input type="radio" name="bpl" value="Y">Yes</label> <label><input type="radio" name="bpl" value="N">No</label></td></tr>
    <tr class="bplrow"><th>BPL Card No.</th><td><input type="text" name="bplno"></td></tr>
    <tr class="bplrow"><th>Year of Issue</th><td><input type="text" name="bplyear" maxlength="4"></td></tr>
    <tr class="bplrow"><th>Issuing Authority</th><td><input type="text" name="bplauth"></td></tr>
    <tr class="bplrow"><th>Upload BPL Card</th><td><input type="file" name="bplfile" accept="application/pdf"></td></tr>
    <tr><th><samp>*</samp> Does it concern the life or Liberty of a Person?</th><td><label><input type="radio" name="life" value="Y">Yes</label> <label><input type="radio" name="life" value="N">No</label></td></tr>
    <tr><th><samp>*</samp> ${textLabel}<br><small>(maximum 3000 characters)</small></th><td><textarea name="RTI_Text" id="RTI_Text" maxlength="3000" rows="10"></textarea></td></tr>
    <tr><th>Supporting document (only pdf upto 1 MB)</th><td><input type="file" name="doc" accept="application/pdf"></td></tr>
    ${captchaRow}
    <tr><th>&nbsp;</th><td><input type="submit" name="mp" value="Make Payment"> <input type="submit" name="sb" value="Submit"> <input type="reset" value="Reset"></td></tr>
  </tbody></table></form>
  <script>
    const m = document.getElementById("Ministry"), pa = document.getElementById("PA");
    const map = ${JSON.stringify(AUTHORITIES)};
    m.addEventListener("change", () => {
      pa.innerHTML = '<option value="">--Select--</option>';
      setTimeout(() => { for (const a of (map[m.value] || [m.value])) { const o = document.createElement("option"); o.textContent = a; pa.appendChild(o); } }, 300);
    });
  </script>${foot}`;
}

export async function startMock(initial: MockOptions = {}): Promise<Mock> {
  let opts: MockOptions = { ...initial };
  const submitted: Record<string, string>[] = [];
  let emailInFlow = "";
  let rtiUrl = "";
  let gatewayUrl = "";

  const rti = await listen(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;
    if (path === "/guidelines.php") {
      return send(
        res,
        `${head("RTI Online :: Guidelines for use of RTI Online Portal")}<p>At present, the text of an application is confined to 3000 characters only.</p>
        <form action="/request/request_email_check.php" method="post"><input type="checkbox" name="CHECKBOX_1"> I have read and understood the above guidelines. <input type="submit" value="Submit"> <input type="button" value="Cancel"></form>${foot}`,
      );
    }
    if (path === "/request/request_email_check.php") {
      const b = req.method === "POST" ? await body(req) : {};
      if (b.CHECKBOX_1 === undefined && b.Email === undefined && b.otp === undefined) return redirect(res, "/guidelines.php?request");
      if (b.otp !== undefined) {
        if (b.otp !== OTP) return send(res, `${head("OTP")}<p style="color:red">Invalid OTP</p><form method="post"><table><tr><th>Enter OTP</th><td><input name="otp"></td></tr></table><input type="submit" value="Verify"></form>${foot}`);
        return send(res, requestForm(opts, emailInFlow));
      }
      if (b.Email !== undefined) {
        if ((b["6_letters_code"] ?? "").toUpperCase() !== CAPTCHA) {
          return send(res, `${head("Email check")}<p style="color:red">Invalid Security Code</p><form method="post"><table><tr><th>* Enter Email Id</th><td><input name="Email"></td></tr>${captchaRow}</table><input type="submit" value="Submit"></form>${foot}`);
        }
        emailInFlow = b.Email;
        return send(res, `${head("OTP")}<p>An OTP has been sent to your email.</p><form method="post"><table><tr><th>* Enter OTP</th><td><input name="otp" maxlength="6"></td></tr></table><input type="submit" value="Verify"></form>${foot}`);
      }
      return send(res, `${head("Email check")}<form method="post"><table><tr><th><samp>*</samp> Enter Email Id</th><td><input type="text" name="Email" id="Email"></td></tr>${captchaRow}</table><input type="submit" value="Submit"></form>${foot}`);
    }
    if (path === "/request/request_submit.php" && req.method === "POST") {
      const b = await body(req);
      if ((b["6_letters_code"] ?? "").toUpperCase() !== CAPTCHA) return send(res, requestForm(opts, emailInFlow, "Invalid Security Code"));
      submitted.push(b);
      if (b.bpl === "Y") return send(res, `${head("RTI Online :: Request submitted")}<p>Your RTI Request is filed successfully.</p><p>Your Registration Number is : ${REG_NO}</p>${foot}`);
      return send(res, `${head("RTI Online :: Payment")}<p>Amount payable Rs. 10</p><p>Payment Mode</p><a href="${gatewayUrl}/sbiepay?ref=42" id="pay">Proceed to SBI ePay</a>${foot}`);
    }
    if (path === "/request/payment_return.php") {
      if (opts.pendingAfterPayment) return send(res, `${head("RTI Online :: Payment")}<p>Transaction is pending. Registration number will be generated after reconciliation within 24-48 working hours.</p>${foot}`);
      return send(res, `${head("RTI Online :: Request submitted")}<p>Payment successful.</p><p>Your Registration Number is : ${REG_NO}</p><p>Date of filing : 17/10/2026</p>${foot}`);
    }
    if (path === "/request/status.php") {
      const b = req.method === "POST" ? await body(req) : {};
      if (b.otp !== undefined) {
        return send(
          res,
          `${head("RTI Online :: View Status")}<table><tr><td>Registration Number</td><td>${REG_NO}</td></tr><tr><td>Name</td><td>[name]</td></tr>
          <tr><td>Status</td><td>REQUEST DISPOSED OF</td></tr><tr><td>Date of Action</td><td>10/10/2026</td></tr>
          <tr><td>Reply</td><td>The information sought at points 1 and 2 is enclosed. Point 3 is not held by this office.</td></tr></table>${foot}`,
        );
      }
      if (b.registration_no !== undefined) {
        if ((b["6_letters_code"] ?? "").toUpperCase() !== CAPTCHA) return send(res, `${head("View Status")}<p style="color:red">Invalid security code</p>${statusForm()}${foot}`);
        return send(res, `${head("View Status")}<p>OTP sent to your email id and mobile number.</p><form method="post"><table><tr><th>* Enter OTP</th><td><input name="otp"></td></tr></table><input type="submit" value="Submit"></form>${foot}`);
      }
      return send(res, `${head("RTI Online :: View Status Form")}${statusForm()}${foot}`);
    }
    if (path === "/request/status_pendingPayment.php") {
      const b = req.method === "POST" ? await body(req) : {};
      if (b.otp !== undefined) {
        return send(
          res,
          `${head("Payment Reconciliation")}<table><tr><th>Registration Number</th><th>Date</th><th>Status</th></tr>
          <tr><td>DOPAT/R/E/26/00007</td><td>02/09/2026</td><td>Success</td></tr>
          <tr><td>${REG_NO}</td><td>17/10/2026</td><td>Success</td></tr></table>${foot}`,
        );
      }
      if (b.Email !== undefined) {
        return send(res, `${head("Payment Reconciliation")}<form method="post"><table><tr><th>* Enter OTP</th><td><input name="otp"></td></tr></table><input type="submit" value="Submit"></form>${foot}`);
      }
      return send(res, `${head("RTI Online :: Online RTI Information System")}${pendingForm()}${foot}`);
    }
    send(res, "not found", 404);
  });

  const gateway = await listen(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/sbiepay") {
      return send(res, `<!doctype html><html><head><title>SBI ePay (simulated)</title></head><body><p>Pay Rs. 10.00</p><a id="paynow" href="${rtiUrl}/request/payment_return.php?ref=${url.searchParams.get("ref")}">Pay now</a></body></html>`);
    }
    send(res, "not found", 404);
  });

  const pmk = await listen(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/BeneficiaryStatus_New.aspx") return send(res, "not found", 404);
    const b = req.method === "POST" ? await body(req) : {};
    const shell = (inner: string) => `<!doctype html><html><head><title>Know Your Status :: PMKisan Samman Nidhi</title></head><body><h1>Know Your Status</h1>${inner}</body></html>`;
    if (b.otp !== undefined) {
      return send(
        res,
        shell(`<div><p>Beneficiary Name : [name]</p><p>eKYC Status : No</p><p>Land Seeding : Yes</p><p>Aadhaar Bank Account Seeding Status : Yes</p>
        <p>19th Installment : Payment Success, credited to A/c</p><p>20th Installment : Not paid, eKYC pending</p></div>`),
      );
    }
    if (b["ctl00$ContentPlaceHolder1$txtBox"] !== undefined) {
      if ((b["ctl00$ContentPlaceHolder1$txtcaptcha"] ?? "").toUpperCase() !== CAPTCHA) return send(res, shell(`<p>Invalid captcha</p>${kysForm()}`));
      return send(res, shell(`<form method="post"><div class="form-group"><label>Enter OTP</label><input name="otp" class="form-control"></div><input type="submit" value="Verify OTP"></form>`));
    }
    send(res, shell(kysForm()));
  });

  rtiUrl = rti.url;
  gatewayUrl = gateway.url;
  return {
    rti: rti.url,
    gateway: gateway.url,
    pmkisan: pmk.url,
    submitted,
    set(next) {
      opts = { ...next };
    },
    async close() {
      await Promise.all([rti, gateway, pmk].map((s) => new Promise((r) => s.server.close(() => r(null)))));
    },
  };
}

/** Real markup of request/status.php (17 Oct 2026), scripts removed. */
function statusForm(): string {
  return `<form name="FrmStatus" action="/request/status.php" method="post" autocomplete="off"> <div class="LoginTabBody theme" style="width: 100%"> <table border="0" cellpadding="0" cellspacing="0" class="login-tab" align="center"> <tbody><tr> <th class="LTHfirst"><samp style="color:#FF0000"><b>*</b></samp> Enter Registration Number</th> <td class="LTDfirst"><input type="text" name="registration_no" id="registration_no" class="StatusInput regOnly" maxlength="21" value=""></td> </tr> <tr> <th class="LTHfirst"><samp style="color:#FF0000"><b>*</b></samp> Enter Email Id</th> <td><input type="text" name="Email" id="Email" value="e.g user@domain.com" class="StatusInput EmailOnly watermark"></td> </tr> ${captchaRow} <tr> <th>&nbsp;</th> <td> <input type="submit" name="Submit" value="Submit" id="Status" class="loginBtn"> <input type="reset" value="Reset" class="loginBtn"> </td> </tr> </tbody></table> </div> </form>`;
}

/** Real markup of request/status_pendingPayment.php (17 Oct 2026), scripts removed. */
function pendingForm(): string {
  return `<form name="FrmStatus" action="/request/status_pendingPayment.php" method="post" autocomplete="off"> <div class="LoginTabBody theme" style="width: 100%"> <table id="tablecolor" border="0" cellpadding="0" cellspacing="0" class="login-tab" align="center"> <tbody><tr> <th id="lblEmail" class="LTHfirst"><samp style="color:#FF0000"><b>*</b></samp> Enter Email Id (For receiving OTP)</th> <td><input type="text" name="Email" id="Email" value="" class="StatusInput EmailOnly watermark"></td> </tr> <tr> <th id="lblmobile" class="LTHfirst">Mobile Number</th> <td class="LTDfirst"><input type="password" name="cell" maxlength="10" class="gatherMob numeric" placeholder="Enter Mobile Number" inputmode="numeric" value="" id="cell"></td> </tr> ${captchaRow} <tr> <th>&nbsp;</th> <td> <input type="submit" name="Submit" value="Submit" id="Status" class="loginBtn"> <input type="reset" value="Reset" class="loginBtn"> </td> </tr> </tbody></table> </div> </form>`;
}

/** Real field names of pmkisan.gov.in BeneficiaryStatus_New.aspx (17 Oct 2026). */
function kysForm(): string {
  return `<form method="post"><div id="ContentPlaceHolder1_Div_OTP" class="commonboxwithshadow benfificiarystatus"><div class="row justify-content-center"> <div class="col-12 col-sm-3 col-md-3"> <div class="form-group"> <label>Enter Registration No.</label> <input name="ctl00$ContentPlaceHolder1$txtBox" type="text" maxlength="12" id="ContentPlaceHolder1_txtBox" class="form-control" autocomplete="off"> </div> </div> <div class="col-12 col-sm-6 col-md-6"> <div class="form-group"><img alt="captcha" data-test-code="${CAPTCHA}" src="data:image/png;base64,AAAA"> <input name="ctl00$ContentPlaceHolder1$txtcaptcha" type="text" id="ContentPlaceHolder1_txtcaptcha" class="form-control" placeholder="Captcha Code"> </div> <input type="submit" name="ctl00$ContentPlaceHolder1$btnsendotp" value="Get OTP" id="ContentPlaceHolder1_btnsendotp"></div></div></div></form><p>OTP will be sent to your Registered Mobile Number.</p>`;
}
