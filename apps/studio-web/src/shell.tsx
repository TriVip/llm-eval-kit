import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Overview", end: true },
  { to: "/runs/new", label: "New run", end: false },
  { to: "/artifacts", label: "Artifacts", end: false },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            LE
          </span>
          <div>
            <strong>LLM Eval</strong>
            <span>Quality Studio</span>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {({ isActive }) => (
                <>
                  <span aria-hidden="true">{isActive ? "◆" : "◇"}</span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <span className="pulse" aria-hidden="true" />
          Local-only mode
        </div>
      </aside>
      <main id="main" className="workspace" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
