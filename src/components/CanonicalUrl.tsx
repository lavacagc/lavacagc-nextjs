// This component is not needed in Next.js
// Canonical URLs are handled through the metadata API in layout.tsx and page.tsx
// Keeping as placeholder for compatibility

interface CanonicalUrlProps {
  customUrl?: string;
}

const CanonicalUrl: React.FC<CanonicalUrlProps> = ({ customUrl }) => {
  return null;
};

export default CanonicalUrl;
