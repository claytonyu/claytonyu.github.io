// Confirm-then-delete flow shared by the task sidebar and the bulk-selection bar.
import { deleteTasks } from "../actions.js";
import { handleError } from "../errors.js";
import { openModal } from "../modal.js";
import { toast } from "../notify.js";

export async function confirmAndDeleteTasks(tasks) {
  const single = tasks.length === 1;
  const canvasNote = tasks.some((task) => task.html_url)
    ? " Deleted Canvas assignments won't be offered by sync again; you can restore them from Canvas Import."
    : "";
  const confirmed = await openModal({
    title: single ? `Delete “${tasks[0].title}”?` : `Delete ${tasks.length} tasks?`,
    message: `This can't be undone.${canvasNote}`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!confirmed) return false;

  try {
    await deleteTasks(tasks);
    toast(single ? "Task deleted." : `${tasks.length} tasks deleted.`);
    return true;
  } catch (error) {
    handleError(error);
    return false;
  }
}
