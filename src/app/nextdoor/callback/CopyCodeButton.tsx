'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is visible above for manual copy.
    }
  }

  return (
    <Button type="button" onClick={copy}>
      {copied ? 'Copied' : 'Copy code'}
    </Button>
  );
}
