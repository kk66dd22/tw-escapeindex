export type TopicJumpTarget = {
  topicId: string;
  targetPage: number;
};

export type TopicJumpRequest = TopicJumpTarget & {
  attempts: number;
};

export function prepareTopicJump(target: TopicJumpTarget): TopicJumpRequest {
  return { ...target, attempts: 0 };
}

export function needsTopicPageChange(currentPage: number, targetPage: number): boolean {
  return currentPage !== targetPage;
}

export function isTopicJumpReady({
  dialogOpen,
  currentPage,
  request,
  targetAttached,
}: {
  dialogOpen: boolean;
  currentPage: number;
  request: TopicJumpRequest | null;
  targetAttached: boolean;
}): boolean {
  return !dialogOpen && request !== null && currentPage === request.targetPage && targetAttached;
}

export function isTopicJumpSuccessful({
  currentPage,
  targetPage,
  resultTitle,
  targetTitle,
  targetTop,
  targetBottom,
  viewportHeight,
}: {
  currentPage: number;
  targetPage: number;
  resultTitle: string | null;
  targetTitle: string | null;
  targetTop: number | null;
  targetBottom: number | null;
  viewportHeight: number;
}): boolean {
  return currentPage === targetPage
    && resultTitle !== null
    && resultTitle === targetTitle
    && targetTop !== null
    && targetBottom !== null
    && targetTop >= 0
    && targetBottom <= viewportHeight;
}
