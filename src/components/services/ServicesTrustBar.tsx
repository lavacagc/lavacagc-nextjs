export default function ServicesTrustBar() {
  return (
    <div className="bg-secondary text-secondary-foreground py-2.5">
      <div className="container mx-auto px-4 text-center text-xs sm:text-sm">
        <span className="font-bold">Licensed, Bonded, &amp; Insured</span>
        <span className="opacity-70 mx-2">|</span>
        <span>HIC# 13VH13373800</span>
        <span className="opacity-70 mx-2 hidden sm:inline">·</span>
        <span className="hidden sm:inline">$1M GL</span>
        <span className="opacity-70 mx-2 hidden sm:inline">·</span>
        <span className="hidden sm:inline">Family-Owned &amp; Operated</span>
      </div>
    </div>
  );
}
