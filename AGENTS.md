# Workspace checkpoint rule

After completing any user-requested source, configuration, or UI modification in this workspace, run:

```powershell
npm run checkpoint -- "concise description of the completed change"
```

The checkpoint command must succeed before reporting the modification as complete. It validates the source, builds both Windows EXE variants, commits tracked changes, creates a timestamped Git tag, and archives both executables under `releases/`.

Do not create a checkpoint for read-only inspection, explanation, or status requests that do not modify the workspace.
