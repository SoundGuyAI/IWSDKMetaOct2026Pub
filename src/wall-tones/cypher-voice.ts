export type NarratorGender = 'male' | 'female';
export type CypherGender = 'male' | 'female';
export interface CypherCast {
  readonly narrator: NarratorGender;
  readonly cypher: CypherGender;
}

/** Cypher is a separate cast member, never the other narrator's recording. */
export function cypherGenderForNarrator(narrator: NarratorGender): CypherGender {
  return narrator === 'male' ? 'female' : 'male';
}

/** Capture once per communication window so an in-flight line never changes cast. */
export function captureCypherCast(narrator: NarratorGender): Readonly<CypherCast> {
  return Object.freeze({ narrator, cypher: cypherGenderForNarrator(narrator) });
}
