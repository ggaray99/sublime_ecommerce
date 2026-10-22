import Image from "next/image";
import Link from "next/link";

/** Official Sublime logo from the client's branding kit (white wordmark in a black box). */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`brand-logo ${className}`.trim()} aria-label="Sublime, ir al inicio">
      <Image src="/brand/sublime-logo.png" alt="Sublime" width={640} height={179} preload />
    </Link>
  );
}
