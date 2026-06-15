import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;

const arcjetMode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

if (!arcjetKey) {
    throw new Error("ARCJET_KEY env variable is missing");
}

export const httpArcjet = arcjet({
    key: arcjetKey,
    log: console,
    rules: [
        shield({ mode: arcjetMode }),
        detectBot({
            mode: arcjetMode,
            allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({
            mode: arcjetMode,
            interval: "10s",
            max: 60,
        }),
    ],
});

export const wsArcjet = arcjet({
    key: arcjetKey,
    log: console,
    rules: [
        shield({ mode: arcjetMode }),
        detectBot({
            mode: arcjetMode,
            allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({
            mode: arcjetMode,
            interval: "2s",
            max: 5,
        }),
    ],
});

export function securityMiddleWare() {
    return async (req, res, next) => {
        console.log("Middleware hit:", req.path);
        try {
            const decision = await httpArcjet.protect(req);

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({
                        error: "Too Many Requests",
                    });
                }

                return res.status(403).json({
                    error: "Forbidden",
                });
            }

            next();
        } catch (error) {
            console.error("Arcjet Middleware error", error);

            return res.status(503).json({
                error: "Service unavailable",
            });
        }
    };
}
