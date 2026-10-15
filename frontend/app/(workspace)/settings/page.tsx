export default function WorkspaceSettingsPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace settings</h1>
          <p>Workspace preferences are read-only in this demo.</p>
        </div>
      </div>
      <section className="profile-main-card">
        <h3 className="detail-section-title">Settings unavailable</h3>
        <p className="muted-copy">This workspace does not currently provide editable settings.</p>
      </section>
    </>
  );
}
