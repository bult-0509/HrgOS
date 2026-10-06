export type PhotoFindStatus = 'locked' | 'pending' | 'approved' | 'rejected';
export interface PhotoFindRecord { status: PhotoFindStatus; submissionId?: string; operatorId?: string; reviewedAt?: string }
export type PhotoFindProgress = Partial<Record<string, PhotoFindRecord>>;
export type PhotoFinds = Record<string, Record<string, PhotoFindProgress>>;
export const isPhotoSlot = (slot?: string) => /^P(0[1-9]|1[0-9])$/.test(slot ?? '');
export function canRevealTask(slot: string | undefined, regionId: string | null, progress: PhotoFindProgress = {}) {
  return !isPhotoSlot(slot) || !!regionId && progress[slot!]?.status === 'approved';
}
export function difficultyLevel(level?: string): '易' | '中' | '难' | '极难' | undefined {
  if (level === '轻松') return '易';
  if (level === '标准') return '中';
  if (level === '挑战') return '难';
  return ['易', '中', '难', '极难'].includes(level ?? '') ? level as '易' | '中' | '难' | '极难' : undefined;
}
