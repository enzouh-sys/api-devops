const { add, subtract } = require('../src/calc');

describe('calc', () => {
  test('add additionne deux entiers', () => {
    expect(add(2, 3)).toBe(5);
  });

  test('add accepte les nombres négatifs', () => {
    expect(add(-4, -6)).toBe(-10);
  });

  test('add refuse une valeur qui n est pas un nombre', () => {
    expect(() => add(2, NaN)).toThrow();
    expect(() => add('a', 3)).toThrow();
  });

  test('subtract soustrait deux entiers', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  test('subtract refuse une valeur manquante', () => {
    expect(() => subtract(undefined, 1)).toThrow();
  });
});
