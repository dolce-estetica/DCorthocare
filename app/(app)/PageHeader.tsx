import Burger from "./Burger";

export default function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <header id="top">
      <Burger />
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      <div className="spacer"></div>
      <div id="topact" className="row">
        {children}
      </div>
    </header>
  );
}
