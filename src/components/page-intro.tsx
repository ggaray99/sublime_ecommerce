import type { ReactNode } from "react";

type Props = {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  tone?: "dark" | "light";
};

/** Shared heading block for inner pages. */
export function PageIntro({ kicker, title, children, tone = "dark" }: Props) {
  return (
    <header className={`page-intro page-intro--${tone}`}>
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      {children && <div className="page-intro__body">{children}</div>}
    </header>
  );
}
