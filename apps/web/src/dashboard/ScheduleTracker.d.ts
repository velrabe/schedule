import type { FunctionComponent } from "preact";
import type { Snapshot } from "./supabase-bridge";

type ScheduleTrackerProps = {
  liveData?: Snapshot;
  sourceBadge?: string | null;
  onReload?: (() => void) | null;
};

declare const ScheduleTracker: FunctionComponent<ScheduleTrackerProps>;
export default ScheduleTracker;
