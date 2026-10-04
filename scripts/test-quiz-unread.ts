/**
 * Verifies quiz grading (SINGLE/MULTI/FREE) and unread-thread counting
 * end-to-end against a scratch org.
 * npx tsx scripts/test-quiz-unread.ts
 */
import { prisma } from "../src/lib/prisma";
import { gradeQuizSubmission } from "../src/lib/quiz";
import { countUnreadThreads } from "../src/lib/messages";
import { computeBriefing } from "../src/lib/briefing";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  // ── 1. Grading: mixed SINGLE + MULTI + FREE ──
  const questions = [
    { q: "Greeting first?", options: ["Yes", "No"], answerIndex: 0 },
    { type: "MULTI" as const, q: "Which are PII?", options: ["Name", "Color", "SSN", "Shoe size"], answerIndexes: [0, 2] },
    { type: "FREE" as const, q: "What law governs credit pulls?", keywords: ["FCRA", "Fair Credit Reporting"] },
  ];

  // All correct (FREE matches 2nd keyword, case-insensitive)
  const perfect = gradeQuizSubmission(questions, [0, [2, 0], "the FAIR credit reporting act"]);
  assert(perfect.score === 100, `perfect submission scores 100 (got ${perfect.score})`);
  assert(perfect.correct === 3, "3 of 3 correct");
  assert(
    JSON.stringify(perfect.review[1]) === JSON.stringify({ kind: "MULTI", correctIndexes: [0, 2] }) &&
    JSON.stringify(perfect.review[2]) === JSON.stringify({ kind: "FREE", keywords: ["FCRA", "Fair Credit Reporting"] }),
    "review reveals correct answers per kind"
  );

  // All wrong / missing (undefined answers, wrong multi, keyword miss)
  const zero = gradeQuizSubmission(questions, [1, [0], "no idea"]);
  assert(zero.score === 0, `wrong submission scores 0 (got ${zero.score})`);

  // Partial: multi missing one index counts as wrong; duplicates normalized
  const partial = gradeQuizSubmission(questions, [0, [0], "fcra"]);
  assert(partial.score === 67, `partial scores 67 (got ${partial.score})`);
  const dup = gradeQuizSubmission(questions, [0, [2, 0, 0, 2], undefined]);
  assert(dup.score === 67, `duplicate multi selections normalized (got ${dup.score})`);

  // ── 2. Unread threads + briefing integration ──
  const org = await prisma.organization.create({ data: { name: "__test-quiz-unread", isDemo: true } });
  const emp = await prisma.employee.create({ data: { organizationId: org.id, name: "Test Emp", title: "GM" } });

  // Thread A: someone else wrote last → unread
  const threadA = await prisma.messageThread.create({
    data: { organizationId: org.id, isGroup: false, participants: { create: [{ employeeId: emp.id }] } },
  });
  await prisma.message.create({ data: { threadId: threadA.id, authorName: "Dana", body: "Lead call at 10?" } });

  // Thread B: I wrote last → not unread
  const threadB = await prisma.messageThread.create({
    data: { organizationId: org.id, isGroup: false, participants: { create: [{ employeeId: emp.id }] } },
  });
  await prisma.message.create({ data: { threadId: threadB.id, authorEmployeeId: emp.id, authorName: "Test Emp", body: "Done." } });

  assert(await countUnreadThreads(org.id) === 1, "one unread thread (other-author last)");

  // Thread C: read up to old message → not unread… then new reply → unread again
  const threadC = await prisma.messageThread.create({
    data: { organizationId: org.id, isGroup: true, title: "Service", participants: { create: [{ employeeId: emp.id, lastReadAt: new Date(Date.now() - 3_600_000) }] } },
  });
  await prisma.message.create({ data: { threadId: threadC.id, authorName: "Dana", body: "old", createdAt: new Date(Date.now() - 7_200_000) } });
  assert(await countUnreadThreads(org.id) === 1, "thread read up to lastReadAt is not unread");
  await prisma.message.create({ data: { threadId: threadC.id, authorName: "Dana", body: "newer than lastRead" } });
  assert(await countUnreadThreads(org.id) === 2, "new reply after lastReadAt becomes unread");

  // Briefing surfaces it (money/decisions zero on empty org, 💬 line present)
  const briefing = await computeBriefing(org.id);
  assert(briefing.unreadMessages === 2, "briefing reports 2 unread");
  assert(briefing.lines.some((l) => l.href === "/messages" && l.text.includes("2")), "briefing includes 💬 line for /messages");

  // ── 3. Legacy SINGLE-only quiz still grades (back-compat) ──
  const mod = await prisma.trainingModule.create({ data: { organizationId: org.id, title: "M", summary: "s", category: "PRODUCT", content: "c" } });
  const lesson = await prisma.trainingLesson.create({ data: { organizationId: org.id, moduleId: mod.id, title: "L", sort: 0 } });
  await prisma.lessonQuiz.create({
    data: { lessonId: lesson.id, passingPct: 80, questions: JSON.stringify([{ q: "2+2?", options: ["3", "4"], answerIndex: 1 }]) },
  });
  const legacy = gradeQuizSubmission([{ q: "2+2?", options: ["3", "4"], answerIndex: 1 }], [1]);
  assert(legacy.score === 100 && legacy.review[0].kind === "SINGLE", "legacy no-type question grades as SINGLE");

  // Cleanup
  await prisma.messageThread.deleteMany({ where: { organizationId: org.id } });
  await prisma.lessonQuiz.deleteMany({ where: { lesson: { moduleId: mod.id } } });
  await prisma.trainingLesson.deleteMany({ where: { moduleId: mod.id } });
  await prisma.trainingModule.delete({ where: { id: mod.id } });
  await prisma.employee.delete({ where: { id: emp.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — quiz grading + unread counting verified, scratch org removed");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
