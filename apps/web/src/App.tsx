import { FIXTURE_CONTENT_REVISION, FIXTURE_UNITS } from "@gettysburg/content";

export function App() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Phase 1 multiplayer vertical slice</p>
        <h1 id="page-title">Gettysburg</h1>
        <p className="summary">
          The typed browser and authoritative server foundation is running.
          Board interaction and room synchronization are the next implementation
          slices.
        </p>
        <dl className="status-grid">
          <div>
            <dt>Content</dt>
            <dd>{FIXTURE_CONTENT_REVISION}</dd>
          </div>
          <div>
            <dt>Fixture counters</dt>
            <dd>{FIXTURE_UNITS.length}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>In-memory only</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
