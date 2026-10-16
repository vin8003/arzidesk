# State rules used by the desk

Code: `src/lib/desk/states.ts`. Everything marked **verify** is shown in the UI as "confirm locally", and the operator's fee line on paper is left blank for the instrument number.

| | Central | Uttar Pradesh | Rajasthan | Madhya Pradesh | Delhi (GNCTD) |
|---|---|---|---|---|---|
| Rules | RTI Rules, 2012 | UP RTI Rules, 2015 | Rajasthan RTI Rules, 2005 | MP RTI (Fees and Appeal) Rules, 2005 | GNCTD fee rules |
| Application fee | ₹10 | ₹10 (verify) | ₹10 (verify) | ₹10 — some sources say ₹50 (verify) | ₹10 (verify) |
| First appeal fee | nil | nil (verify) | nil (verify) | ₹50 — some sources say nil (verify) | nil (verify) |
| Second appeal fee | nil | nil | nil | ₹100 — some sources say nil (verify) | nil |
| Word limit | 500 (ordinarily) | 500, one subject | — | — | — |
| Online route | rtionline.gov.in (central only) | rtionline.up.gov.in (many, not all, state departments) | none confirmed → post / hand | rtionline.mp.gov.in | none confirmed → post / hand |
| Second appeal to | CIC | UP SIC | Rajasthan SIC | MP SIC | **CIC** (no SIC in Delhi) |
| Grievance portal | CPGRAMS (pgportal.gov.in) | IGRS / Jansunwai, 1076 | Rajasthan Sampark, 181 | CM Helpline, 181 | PGMS (pgms.delhi.gov.in) |
| Pension status | NSAP (nsap.nic.in) | sspy-up.gov.in | ssp.rajasthan.gov.in | socialsecurity.mp.gov.in | edistrict.delhigovt.nic.in |
| Block office | — | BDO, Kshetra Panchayat | Vikas Adhikari, Panchayat Samiti | CEO, Janpad Panchayat | none: District Social Welfare Office / SDM |

Common to all: BPL applicants pay no application fee (s.7(5)); 30-day reply (48 h for life or liberty, +5 days via APIO); first appeal within 30 days; second appeal within 90 days.

Consumer: District Commission up to ₹50 lakh, State ₹50 lakh–₹2 crore, National above (Jurisdiction Rules, 2021); District filing fee nil up to ₹5 lakh, then ₹200 / ₹400 / ₹1,000 / ₹2,000 by slab (as reported; verify); limitation two years (s.69 CPA 2019). NCH: 1915, WhatsApp 8800001915, consumerhelpline.gov.in. E-filing: e-jagriti.gov.in.

Schemes (`src/lib/desk/schemes.ts`): PM-Kisan (pmkisan.gov.in, helpline 155261), MGNREGA (nrega.nic.in; s.3(3) wages within a fortnight; Schedule II delay compensation 0.05% per day), pensions (NSAP + state portal).

## Sources consulted (October 2026)

- RTI Online (central portal and its guidelines): https://rtionline.gov.in
- UP RTI Rules 2015 (UP Police copy): https://www.uppolice.gov.in/site/writereaddata/siteContent/RTI/202008031111405028RTI_Rules%202015.pdf
- UP RTI portal user manual and FAQ: https://rtionline.up.gov.in/UMcitizen_Eng.pdf, https://rtionline.up.gov.in/FAQ-RTI-Eng.pdf
- CHRI comparative table of fee rules: https://www.humanrightsinitiative.org/programs/ai/rti/india/comparative_table_on_the_fee_rules_issued_by_central_&_state_govt.pdf
- RTI Wiki state pages (unofficial; used only where marked verify): https://righttoinformation.wiki/fees/madhya-pradesh, https://righttoinformation.wiki/fees/rajasthan, https://righttoinformation.wiki/states/delhi
- NeGD directory, MP RTI portal: https://negd.gov.in/isl/Directory/statedata/218
- Delhi PGMS: https://pgms.delhi.gov.in
- e-Jagriti overview: https://en.vikaspedia.in/viewcontent/social-welfare/social-awareness/consumer-education/e-jagriti-portal-for-consumer-grievance-redressal
- DPDP Act s.44(3) and RTI s.8(1)(j): https://foxmandal.in/News/supreme-court-hearing-dpdp-act-challenges-to-rti/

Before a wide launch, replace every "verify" with the Gazette text for that state and drop the flag.
