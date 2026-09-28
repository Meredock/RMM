// Actions only admins may take. The API enforces these; the UI hides them for
// technicians via useSession().

// isScriptCommand reports whether a raw device command runs a script. The
// Scripts page and scheduled tasks dispatch scripts as `runscript <shell> <b64>`,
// so the raw command APIs must apply the same admin-only rule to it.
export function isScriptCommand(command: string): boolean {
  return /^runscript(\s|$)/i.test(command.trim());
}

// taskRunsScript reports whether a scheduled task runs a script, either as a
// saved-script task or as a raw `runscript` command.
export function taskRunsScript(task: { action: string; command: string | null }): boolean {
  return task.action === "SCRIPT" || (task.command !== null && isScriptCommand(task.command));
}
