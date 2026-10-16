export type Plural = { one: string; other: string };
export type Entry = string | Plural;

// A translation of an English namespace: exactly its keys, plurals stay plurals.
export type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Plural };
