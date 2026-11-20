interface NamedOfficer {
  name: string;
  role?: string;
}

export function writtenResolution(input: {
  entityName: string;
  crNumber: string;
  yearEnd: string;
  directors: NamedOfficer[];
}): string {
  const names = input.directors.map((officer) => officer.name).join(", ") || "the director";
  return [
    `${input.entityName}`,
    `CR ${input.crNumber || "—"}`,
    "",
    "Written resolution of the directors",
    "",
    `Date: ${input.yearEnd}`,
    "",
    `We, ${names}, being the directors of ${input.entityName}, resolve that:`,
    "",
    `1. The financial statements for the year ended ${input.yearEnd} be approved.`,
    "2. The profits tax computation prepared from those statements be adopted as a draft for the tax representative.",
    "3. The annual return be prepared from the register of members and directors.",
    "",
    "This is a working draft. It is not a signed resolution until the directors sign it.",
    "",
    ...input.directors.map((officer) => `______________________________\n${officer.name}, director`),
  ].join("\n");
}

export function agmMinutes(input: {
  entityName: string;
  crNumber: string;
  yearEnd: string;
  heldOn: string;
  directors: NamedOfficer[];
  shareholders: NamedOfficer[];
}): string {
  const chair = input.directors[0]?.name ?? "the chair";
  const members = input.shareholders.map((officer) => officer.name).join(", ") || "the member";
  return [
    `${input.entityName}`,
    `CR ${input.crNumber || "—"}`,
    "",
    "Minutes of the annual general meeting",
    "",
    `Held on ${input.heldOn}.`,
    `Chair: ${chair}.`,
    `Present: ${members}.`,
    "",
    "1. The chair declared the meeting open.",
    `2. The financial statements for the year ended ${input.yearEnd} were laid before the meeting.`,
    "3. It was resolved that the financial statements be received.",
    "4. It was resolved that the directors continue in office.",
    "5. There being no further business, the chair closed the meeting.",
    "",
    "Draft only. Not minutes of a meeting that has been held.",
    "",
    `______________________________\n${chair}, chair`,
  ].join("\n");
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
