import { describe, it, expect } from 'vitest';
import { bodyToSrcDoc } from './Prospects';

describe('bodyToSrcDoc (message preview rendering)', () => {
  it('neutralizes an injected <script> tag so it cannot execute', () => {
    const body = 'Hi there,\n<script>window.__pwned = true;</script>\nThanks.';
    const doc = bodyToSrcDoc(body);

    // The body is HTML-escaped before it ever reaches the srcDoc string, so
    // no literal <script> tag exists in the markup the iframe would parse -
    // this is what makes the empty sandbox="" attribute belt-and-suspenders
    // rather than the only thing standing between a reply and script execution.
    expect(doc).not.toContain('<script>');
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).not.toMatch(/<script[\s>]/);
  });

  it('keeps the unsubscribe / compliance footer intact in the preview, verbatim', () => {
    const footer = "Reply 'unsubscribe' at any time to stop receiving these emails. 123 Main St.";
    const body = `Hi Jordan,\n\nFollowing up on our chat.\n\n${footer}`;
    const doc = bodyToSrcDoc(body);

    // Footer text must survive character-for-character (escaped, not stripped).
    expect(doc).toContain('unsubscribe');
    expect(doc).toContain('123 Main St.');
  });

  it('escapes HTML special characters and turns newlines into <br>', () => {
    const doc = bodyToSrcDoc('Line one\nLine "two" & <more>');
    expect(doc).toContain('Line one<br>Line &quot;two&quot; &amp; &lt;more&gt;');
  });
});
