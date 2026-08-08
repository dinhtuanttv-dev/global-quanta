import type { RadarDigest } from '../../types';

interface Props {
  digest: RadarDigest;
}

export default function DigestNote({ digest }: Props) {
  return (
    <div className="digest-note">
      🔄 <span dangerouslySetInnerHTML={{ __html: highlightTickers(digest.text) }} />
    </div>
  );
}

// In đậm các mã viết hoa 3-4 ký tự trong câu digest để dễ quét mắt
function highlightTickers(text: string): string {
  return text.replace(/\b[A-Z]{3,4}\b/g, (m) => `<b>${m}</b>`);
}
