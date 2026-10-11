import { openDatabase } from "@/lib/db";

export const memoryDb = () => openDatabase(":memory:");
