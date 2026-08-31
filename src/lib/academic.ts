/**
 * Academic calendar helpers.
 * The school year is assumed to end in June: from July onward the
 * "current" school year is the one ending the following calendar year.
 */
export function currentSchoolYearEnd(date: Date = new Date()): number {
  const y = date.getFullYear();
  return date.getMonth() >= 6 ? y + 1 : y;
}

/** High school graduation year ("Class of …") for a given grade level. */
export function graduationYear(gradeLevel: number, date: Date = new Date()): number {
  return currentSchoolYearEnd(date) + (12 - gradeLevel);
}

export function graduatingClassLabel(gradeLevel: number): string {
  return `Class of ${graduationYear(gradeLevel)}`;
}
