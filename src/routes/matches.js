import { Router } from "express";
import { createMatchSchema, listMatchesQuerySchema } from "../validation/matches.js";
import { db } from "../db/db.js"
import { matches } from "../db/schema.js"
import { desc } from "drizzle-orm";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get("/", async (req, res) => {

    const parsed = listMatchesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query', details: JSON.stringify(parsed.error) })
    }

    const limit = Math.min(parsed
        .data.limit ?? 50, MAX_LIMIT)

    try {
        const data = await db
            .select()
            .from(matches)
            .orderBy(desc(matches.createdAt))
            .limit(limit)

        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: "Failed to list matches" })
    }
});

matchRouter.post("/", async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid Payload",
            details: parsed.error,
        });
    }

    const { startTime, endTime, homeScore, awayScore } = parsed.data;

    try {
        const [event] = await db
            .insert(matches)
            .values({
                ...parsed.data,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                homeScore: homeScore ?? 0,
                awayScore: awayScore ?? 0,
            })
            .returning();

        //checking if a matchh is created so we broadcast to all
        //users after inserting it in the db

        if (res.app.locals.broadcastMatchCreated) {
            res.app.locals.broadcastMatchCreated(event)
        }

        return res.status(201).json(event);
    } catch (error) {
        return res.status(500).json({
            error: "Database Error",
            details: error.message,
        });
    }
});
matchRouter.patch("/:id/score", async (req, res) => {
    const matchId = Number(req.params.id);

    if (!Number.isInteger(matchId)) {
        return res.status(400).json({
            error: "Invalid match ID",
        });
    }

    const { homeScore, awayScore } = req.body;

    if (
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore)
    ) {
        return res.status(400).json({
            error: "homeScore and awayScore must be integers",
        });
    }

    try {
        const [updated] = await db
            .update(matches)
            .set({
                homeScore,
                awayScore,
            })
            .where(eq(matches.id, matchId))
            .returning();

        if (!updated) {
            return res.status(404).json({
                error: "Match not found",
            });
        }

        // realtime score update
        if (req.app.locals.broadcastMatchUpdated) {
            req.app.locals.broadcastMatchUpdated(updated);
        }

        return res.status(200).json({
            data: updated,
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to update score",
        });
    }
});