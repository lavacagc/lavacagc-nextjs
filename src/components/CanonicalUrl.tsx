// This component is not needed in Next.js
// Canonical URLs are handled through the metadata API in layout.tsx and page.tsx
// Keeping as placeholder for compatibility

interface CanonicalUrlProps {
  customUrl?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CanonicalUrl: React.FC<CanonicalUrlProps> = (_props) => {
  return null;
};

export default CanonicalUrl;
