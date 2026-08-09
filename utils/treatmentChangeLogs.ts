import { TreatmentChangeLog } from '../types';
import { getLocalDateKeyFromTimestamp } from './date';

const isNoteOnlyChange = (log: TreatmentChangeLog) => (
  log.changedFields.length === 1 && log.changedFields[0] === 'note'
);

const cloneLog = (log: TreatmentChangeLog): TreatmentChangeLog => ({
  ...log,
  changedFields: [...log.changedFields],
  before: { ...log.before },
  after: { ...log.after }
});

export const mergeConsecutiveSameDayNoteChanges = (logs: TreatmentChangeLog[]) => (
  logs.reduce<TreatmentChangeLog[]>((merged, sourceLog) => {
    const log = cloneLog(sourceLog);
    const previous = merged[merged.length - 1];
    const sameDay = previous
      && getLocalDateKeyFromTimestamp(previous.changedAt) === getLocalDateKeyFromTimestamp(log.changedAt);

    if (previous && sameDay && isNoteOnlyChange(previous) && isNoteOnlyChange(log)) {
      merged[merged.length - 1] = {
        ...previous,
        changedAt: log.changedAt,
        after: { ...previous.after, note: log.after.note },
        note: log.note ?? previous.note
      };
      return merged;
    }

    merged.push(log);
    return merged;
  }, [])
);
