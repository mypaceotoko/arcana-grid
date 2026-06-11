export type RuleErrorCode =
  | "INVALID_ACTION"
  | "NOT_YOUR_TURN"
  | "INVALID_PHASE"
  | "UNIT_NOT_FOUND"
  | "UNIT_NOT_OWNED"
  | "UNIT_DEFEATED"
  | "OUT_OF_BOUNDS"
  | "ILLEGAL_MOVE"
  | "PATH_BLOCKED"
  | "DESTINATION_OCCUPIED"
  | "STALE_STATE_VERSION"
  | "MATCH_FINISHED";

export type RuleError = {
  code: RuleErrorCode;
  message: string;
  details?: Record<string, unknown>;
};
