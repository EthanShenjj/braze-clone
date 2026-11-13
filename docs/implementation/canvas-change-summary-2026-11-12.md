# Canvas Changes Since Last Viewed

The standalone `CanvasChangeSummary` component accepts `{workspaceId,canvasId,current:{name,description,tags,graph,wizard}}`. The parent can render it in the expanded Canvas overview.

Counts describe actual differences between the supplied current Canvas and the last view snapshot recorded by this browser. The implementation stores a versioned preference under a key containing both workspace and Canvas IDs. Reading validates the version, scope, timestamp, metadata, graph, and wizard shape. An absent, malformed, oversized, or inaccessible preference yields zero known changes. The first view does not fabricate a previous revision.

The diff lists added, removed, and modified steps; added/removed connections; added, removed, and modified variants; changed wizard fields; and changed name, description, or tags. A modified step counts once and exposes its changed fields. Arrays such as wizard filters are compared as fields. Node/connection ordering, object key ordering, and tag ordering do not create changes. No default variant or synthetic step is introduced into the comparison.

The count button opens a native accessible dialog with the timestamp, change list, and previous/current values. Closing the dialog records the current view and resets the count. Leaving the component or page also records the latest supplied view. React development effect remounts do not consume the previous snapshot. Storage write failures preserve a safe in-memory view state for the mounted component.

The preference writes only its own localStorage key. It does not update the Canvas, graph, wizard, server resource history, or audit records. This is the current project's independently verifiable view-preference behavior. The available source observations do not establish Braze's internal version or permission semantics.

Model tests verify literal change counts, workspace/Canvas isolation, immutable snapshots, order-insensitive comparisons, and malformed/disabled storage fallback. A real component render test verifies the initial zero-count viewer. Browser acceptance is coordinated by the root agent.
