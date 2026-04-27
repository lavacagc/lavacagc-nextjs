import { estimateEmailHtml } from '../src/lib/emailTemplates';
import { writeFileSync } from 'fs';

const html = estimateEmailHtml({
  recipientName: 'Maria Santos',
  projectType: 'Bathroom Renovation',
  estimateUrl: 'https://qbo.intuit.com/app/estimate/preview/sample',
  portalUrl: 'https://www.lavacagc.com/portal',
  updateCadence: 'weekly',
  personalNote:
    "Maria — really enjoyed our walkthrough yesterday. The Schluter waterproofing system you asked about is included in this estimate. The estimate is good for 30 days; let me know if you'd like to walk through it on a quick call.",
});

writeFileSync('/tmp/estimate-preview.html', html);
console.log(`Wrote /tmp/estimate-preview.html (${html.length} bytes)`);
