import type {
  Coordinate,
  GameEventPayload,
  Result,
  RuleError,
  UnitState,
} from "../../core";
import { areCoordinatesEqual } from "../../core";
import type { TacticalRuleConfig } from "./types";
import type {
  CombatOutcome,
  CombatResult,
  DestinationOccupant,
} from "./combat-types";

export type ResolveCombatInput = {
  attacker: UnitState;
  defender: UnitState;
  attackerOrigin: Coordinate;
  destination: Coordinate;
  config?: TacticalRuleConfig;
};

type CombatResolution = {
  outcome: CombatOutcome;
  attacker: UnitState;
  defender: UnitState;
  destinationOccupant: DestinationOccupant;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const clampDefense = (currentDefense: number): number =>
  Math.max(0, currentDefense);

const defeatUnit = (unit: UnitState): UnitState => ({
  ...unit,
  status: "defeated",
  position: null,
  currentDefense: 0,
});

const setUnitDefense = (unit: UnitState, currentDefense: number): UnitState => ({
  ...unit,
  currentDefense,
});

const setUnitPosition = (unit: UnitState, position: Coordinate): UnitState => ({
  ...unit,
  position: cloneCoordinate(position),
});

const isValidCombatNumber = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const validateCombatInput = ({
  attacker,
  defender,
  attackerOrigin,
  destination,
}: ResolveCombatInput): RuleError | null => {
  if (attacker.id === defender.id) {
    return makeRuleError(
      "INVALID_COMBATANTS",
      "A unit cannot fight itself.",
      { unitId: attacker.id },
    );
  }

  if (attacker.ownerId === defender.ownerId) {
    return makeRuleError(
      "SAME_OWNER_COMBAT",
      "Combatants must belong to different owners.",
      { attackerOwnerId: attacker.ownerId, defenderOwnerId: defender.ownerId },
    );
  }

  if (
    attacker.status !== "board" ||
    defender.status !== "board" ||
    attacker.position === null ||
    defender.position === null
  ) {
    return makeRuleError(
      "COMBATANT_NOT_ON_BOARD",
      "Both combatants must be on the board.",
      {
        attackerId: attacker.id,
        attackerStatus: attacker.status,
        attackerPosition: attacker.position,
        defenderId: defender.id,
        defenderStatus: defender.status,
        defenderPosition: defender.position,
      },
    );
  }

  if (!areCoordinatesEqual(attacker.position, attackerOrigin)) {
    return makeRuleError(
      "INVALID_COMBAT_DESTINATION",
      "Attacker origin must match attacker position.",
      {
        attackerId: attacker.id,
        attackerPosition: attacker.position,
        attackerOrigin,
      },
    );
  }

  if (!areCoordinatesEqual(defender.position, destination)) {
    return makeRuleError(
      "INVALID_COMBAT_DESTINATION",
      "Combat destination must match defender position.",
      {
        defenderId: defender.id,
        defenderPosition: defender.position,
        destination,
      },
    );
  }

  if (
    !isValidCombatNumber(attacker.card.baseAttack) ||
    !isValidCombatNumber(defender.card.baseAttack) ||
    !isValidCombatNumber(attacker.currentDefense) ||
    !isValidCombatNumber(defender.currentDefense)
  ) {
    return makeRuleError(
      "INVALID_COMBAT_VALUE",
      "Combat attack and current defense values must be non-negative finite numbers.",
      {
        attackerBaseAttack: attacker.card.baseAttack,
        defenderBaseAttack: defender.card.baseAttack,
        attackerCurrentDefense: attacker.currentDefense,
        defenderCurrentDefense: defender.currentDefense,
      },
    );
  }

  return null;
};

const resolveAttackStanceCombat = (
  attacker: UnitState,
  defender: UnitState,
  destination: Coordinate,
): CombatResolution => {
  const attackerAttack = attacker.card.baseAttack;
  const defenderAttack = defender.card.baseAttack;

  if (attackerAttack === defenderAttack) {
    return {
      outcome: "both_defeated",
      attacker: defeatUnit(attacker),
      defender: defeatUnit(defender),
      destinationOccupant: "none",
    };
  }

  if (attackerAttack > defenderAttack) {
    const nextAttackerDefense = clampDefense(
      attacker.currentDefense - defenderAttack,
    );
    const defeatedDefender = defeatUnit(defender);

    if (nextAttackerDefense <= 0) {
      return {
        outcome: "both_defeated",
        attacker: defeatUnit(attacker),
        defender: defeatedDefender,
        destinationOccupant: "none",
      };
    }

    return {
      outcome: "attacker_survived_attack_clash",
      attacker: setUnitPosition(
        setUnitDefense(attacker, nextAttackerDefense),
        destination,
      ),
      defender: defeatedDefender,
      destinationOccupant: "attacker",
    };
  }

  const nextDefenderDefense = clampDefense(
    defender.currentDefense - attackerAttack,
  );
  const defeatedAttacker = defeatUnit(attacker);

  if (nextDefenderDefense <= 0) {
    return {
      outcome: "both_defeated",
      attacker: defeatedAttacker,
      defender: defeatUnit(defender),
      destinationOccupant: "none",
    };
  }

  return {
    outcome: "defender_survived_attack_clash",
    attacker: defeatedAttacker,
    defender: setUnitDefense(
      setUnitPosition(defender, destination),
      nextDefenderDefense,
    ),
    destinationOccupant: "defender",
  };
};

const resolveDefenseStanceCombat = (
  attacker: UnitState,
  defender: UnitState,
  attackerOrigin: Coordinate,
  destination: Coordinate,
): CombatResolution => {
  const nextDefenderDefense = clampDefense(
    defender.currentDefense - attacker.card.baseAttack,
  );

  if (nextDefenderDefense <= 0) {
    return {
      outcome: "defender_defeated",
      attacker: setUnitPosition(attacker, destination),
      defender: defeatUnit(defender),
      destinationOccupant: "attacker",
    };
  }

  return {
    outcome: "defense_held",
    attacker: setUnitPosition(attacker, attackerOrigin),
    defender: setUnitDefense(
      setUnitPosition(defender, destination),
      nextDefenderDefense,
    ),
    destinationOccupant: "defender",
  };
};

const getDefenseChangedEvents = (
  originalAttacker: UnitState,
  originalDefender: UnitState,
  nextAttacker: UnitState,
  nextDefender: UnitState,
): readonly GameEventPayload[] => {
  const events: GameEventPayload[] = [];

  if (originalAttacker.currentDefense !== nextAttacker.currentDefense) {
    events.push({
      type: "DEFENSE_CHANGED",
      unitId: originalAttacker.id,
      previousDefense: originalAttacker.currentDefense,
      nextDefense: nextAttacker.currentDefense,
    });
  }

  if (originalDefender.currentDefense !== nextDefender.currentDefense) {
    events.push({
      type: "DEFENSE_CHANGED",
      unitId: originalDefender.id,
      previousDefense: originalDefender.currentDefense,
      nextDefense: nextDefender.currentDefense,
    });
  }

  return events;
};

const getDefeatedEvents = (
  originalAttacker: UnitState,
  originalDefender: UnitState,
  nextAttacker: UnitState,
  nextDefender: UnitState,
): readonly GameEventPayload[] => {
  const events: GameEventPayload[] = [];

  if (
    originalAttacker.status !== "defeated" &&
    nextAttacker.status === "defeated"
  ) {
    events.push({ type: "UNIT_DEFEATED", unitId: originalAttacker.id });
  }

  if (
    originalDefender.status !== "defeated" &&
    nextDefender.status === "defeated"
  ) {
    events.push({ type: "UNIT_DEFEATED", unitId: originalDefender.id });
  }

  return events;
};

const buildCombatEvents = (
  originalAttacker: UnitState,
  originalDefender: UnitState,
  nextAttacker: UnitState,
  nextDefender: UnitState,
): readonly GameEventPayload[] => [
  {
    type: "COMBAT_RESOLVED",
    attackerUnitId: originalAttacker.id,
    defenderUnitId: originalDefender.id,
  },
  ...getDefenseChangedEvents(
    originalAttacker,
    originalDefender,
    nextAttacker,
    nextDefender,
  ),
  ...getDefeatedEvents(
    originalAttacker,
    originalDefender,
    nextAttacker,
    nextDefender,
  ),
];

export const resolveCombat = (
  input: ResolveCombatInput,
): Result<CombatResult, RuleError> => {
  const validationError = validateCombatInput(input);

  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const attackerOrigin = cloneCoordinate(input.attackerOrigin);
  const destination = cloneCoordinate(input.destination);
  const resolution =
    input.defender.stance === "attack"
      ? resolveAttackStanceCombat(
          input.attacker,
          input.defender,
          destination,
        )
      : resolveDefenseStanceCombat(
          input.attacker,
          input.defender,
          attackerOrigin,
          destination,
        );

  return {
    ok: true,
    value: {
      outcome: resolution.outcome,
      attacker: resolution.attacker,
      defender: resolution.defender,
      attackerOrigin,
      destination,
      destinationOccupant: resolution.destinationOccupant,
      events: buildCombatEvents(
        input.attacker,
        input.defender,
        resolution.attacker,
        resolution.defender,
      ),
    },
  };
};
