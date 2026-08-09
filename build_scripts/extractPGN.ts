import { pgnRead, pgnWrite, DateValue } from 'kokopu'
import cleanPgn from "./pgnCleaner.js";
import { extractPlayersFromDescription } from "./players/playersExtractor.js";
import getPlayersForId from "./players/playersOverrides.js";
import { database, NAMESPACE_VIDEO_SNIPPET } from "./db.js";
import { pgnOverrides } from "./pgnOverrides.js";
import { dateOverrides } from "./dateOverrides.js";
import _ from "lodash"
import { lichessClient } from "./lichess/LichessClient.js";

export type DescriptionGame = {
    pgn?: string,
    fen?: string,
    playerWhite?: string,
    playerBlack?: string,
    date?: string
}

enum PgnSource {
    OVERRIDE = 0,
    LINE = 1
}

/**
 * Directly extracts [Date "YYYY.MM.DD"] header from raw PGN text block
 */
function extractHeaderDate(pgnString: string): string | undefined {
    if (!pgnString) return undefined;
    
    // Matches [Date "1973.02.26"] or similar tags across whitespace
    const match = pgnString.match(/\[Date\s+"([^"]+)"\]/i);
    if (match && match[1]) {
        return normalizePgnDate(match[1]);
    }
    return undefined;
}

/**
 * Normalizes PGN date string (e.g., "1973.02.26" -> "1973-02-26")
 */
function normalizePgnDate(pgnDateInput?: DateValue | string): string | undefined {
    if (!pgnDateInput) {
        return undefined;
    }

    const pgnDateStr = typeof pgnDateInput === 'string' 
        ? pgnDateInput 
        : pgnDateInput.toString();

    if (pgnDateStr === "????.??.??" || pgnDateStr === "" || pgnDateStr.includes("????")) {
        return undefined;
    }

    // Standardize PGN date dots/slashes to dashes: YYYY.MM.DD -> YYYY-MM-DD
    const parts = pgnDateStr.replaceAll('.', '-').replaceAll('/', '-').split('-');
    if (parts.length === 3) {
        const year = parts[0].includes('?') ? '????' : parts[0];
        const month = parts[1].includes('?') ? '??' : _.padStart(parts[1], 2, '0');
        const day = parts[2].includes('?') ? '??' : _.padStart(parts[2], 2, '0');
        
        if (year === '????') return undefined;
        return `${year}-${month}-${day}`;
    }
    return pgnDateStr;
}

function translateMonth(month: string) {
    const months = new Map<string, number>([
        ["Jan", 1], ["Feb", 2], ["Mar", 3], ["Apr", 4],
        ["May", 5], ["Jun", 6], ["Jul", 7], ["Aug", 8],
        ["Sept", 9], ["Sep", 9], ["Oct", 10], ["Nov", 11], ["Dec", 12]
    ])
    if (!months.has(month)) {
        throw `Invalid month: ${month}`
    }
    return _.padStart(`${months.get(month)}`, 2, '0')
}

function extractDateFromDescription(id: string, textToScan: string): string | undefined {
    // Priority 1: Check if there's an explicit [Date "YYYY.MM.DD"] tag anywhere in the block
    const headerDate = extractHeaderDate(textToScan);
    if (headerDate) {
        return headerDate;
    }

    const cleanText = textToScan.split('\n')
        .filter(line => !line.match(/game\s+of\s+the\s+day/i))
        .join('\n');

    // Priority 2: Full YYYY-MM-DD or YYYY.MM.DD regex pattern
    const yyyyMMddRegex = /\b((?:1[4-9]|20)\d\d)[.-](0?[1-9]|1[0-2])[.-](0?[1-9]|[12]\d|3[01])\b/g;
    const yyyyMatches = [...cleanText.matchAll(yyyyMMddRegex)];
    if (yyyyMatches.length > 0) {
        const [, year, month, day] = yyyyMatches[0];
        return `${year}-${_.padStart(month, 2, '0')}-${_.padStart(day, 2, '0')}`;
    }

    // Priority 3: DD-MM-YYYY format
    const ddMMyyyyRegex = /\b(0?[1-9]|[12]\d|3[01])[.-](0?[1-9]|1[0-2])[.-]((?:1[4-9]|20)\d\d)\b/g;
    const ddMatches = [...cleanText.matchAll(ddMMyyyyRegex)];
    if (ddMatches.length > 0) {
        const [, day, month, year] = ddMatches[0];
        return `${year}-${_.padStart(month, 2, '0')}-${_.padStart(day, 2, '0')}`;
    }

    // Priority 4: Month DD, YYYY format
    const monthddyyyyRegex = /\b(Jan|Feb|Mar|Apr|Jul|Aug|Sept|Sep|Oct|Nov|Dec)[.-](0?[1-9]|[12]\d|3[01])[.-]((?:1[4-9]|20)\d\d)\b/gi;
    const monthMatches = [...cleanText.matchAll(monthddyyyyRegex)];
    if (monthMatches.length > 0) {
        const [, month, day, year] = monthMatches[0];
        return `${year}-${translateMonth(_.capitalize(month))}-${_.padStart(day, 2, '0')}`;
    }

    return undefined;
}

async function extractGames(description: string, id: string): Promise<DescriptionGame[]> {
    description = description.replaceAll("\n. e4 c6 2.", "\n1. e4 c6 2.")

    const pgns = getPgns(id, description)
    let players = getPlayersForId(id)

    if (players) {
        const pgnDate = pgns && pgns[0] ? pgns[0].date : undefined;
        const date = dateOverrides[id] || pgnDate || extractDateFromDescription(id, description);

        return [{
            pgn: pgns && pgns[0] ? pgns[0].pgn : undefined,
            fen: pgns && pgns[0] ? pgns[0].fen : undefined,
            playerWhite: players.white,
            playerBlack: players.black,
            date: date
        }]
    }

    if (pgns.length > 0) {
        const descriptionLines = description.split("\n");
        let previousPgnLineIdx = -1

        return pgns.map(pgnExtractionResult => {
            let linesAbove = description;
            if (pgnExtractionResult.lineIdx) {
                linesAbove = descriptionLines.slice(previousPgnLineIdx + 1, pgnExtractionResult.lineIdx + 1).join("\n") + "\n";
                previousPgnLineIdx = pgnExtractionResult.lineIdx
            }

            players = extractPlayersFromDescription(id, linesAbove)
            
            // PRIORITY: 1. Manual Override -> 2. Extracted PGN Date -> 3. Fallback Description Regex
            const date = dateOverrides[id] || pgnExtractionResult.date || extractDateFromDescription(id, description);

            let game: any = {}
            game.pgn = pgnExtractionResult.pgn
            game.fen = pgnExtractionResult.fen
            if (players) {
                game.playerWhite = players.white
                game.playerBlack = players.black
            }
            if (date) {
                game.date = date
            }
            return game
        })
    } else {
        players = extractPlayersFromDescription(id, description)
        const date = dateOverrides[id] || extractDateFromDescription(id, description)
        let game: any = {}

        if (players) {
            game.playerWhite = players.white
            game.playerBlack = players.black
        }
        if (date) {
            game.date = date
        }

        const lichessGameRegex = /game\s+here!?[\s\n\r]+https?:\/\/lichess\.org\/(?<gameId>[^\s/]{8})/mi
        const lichessGameMatch = description.match(lichessGameRegex);
        if (Object.keys(game).length === 0 && lichessGameMatch && lichessGameMatch.groups) {
            try {
                const lichessGame = await lichessClient.exportGame(lichessGameMatch.groups.gameId)
                game.playerWhite = lichessGame.players?.white?.user?.name
                game.playerBlack = lichessGame.players?.black?.user?.name
                game.date = new Date(lichessGame.createdAt).toISOString().substring(0, 10)
                const pgn = cleanPgn(lichessGame.pgn)
                const parsedGame = parseUsingKokopu(pgn);
                if (parsedGame) {
                    game.pgn = parsedGame.pgn
                    game.fen = parsedGame.fen
                } else {
                    console.error(`Failed to load lichess PGN ${lichessGameMatch.groups.gameId} ${pgn} `)
                }
            } catch (e) {
            }
        }

        return [game]
    }
}

type PgnExtraction = {
    source?: PgnSource,
    pgn?: string,
    fen?: string,
    date?: string,
    lineIdx?: number
}

function getPgns(id: string, description: string): PgnExtraction[] {
    if (pgnOverrides[id]) {
        const rawOverride = pgnOverrides[id];
        const kokopuParse = parseUsingKokopu(rawOverride);
        if (!kokopuParse) {
            throw `${id} Failed to parse PGN from override`
        }
        return [{
            source: PgnSource.OVERRIDE,
            pgn: kokopuParse.pgn,
            fen: kokopuParse.fen,
            date: extractHeaderDate(rawOverride) || kokopuParse.date
        }]
    } else {
        const descriptionLines = description.split("\n");
        const resultArray: PgnExtraction[] = [];

        for (let i = 0; i < descriptionLines.length; i++) {
            const line = descriptionLines[i];
            
            // Check if line contains move 1 notation
            if (/11?\.(?!\.)(?! Ian)/.test(line)) {
                let pgnAccumulator = line;
                let currentLineIdx = i;

                // Look ahead for preceding headers (e.g. [Event ...], [Date ...]) on earlier lines
                let headerBlock = "";
                let headerStartIdx = i;
                while (headerStartIdx > 0 && descriptionLines[headerStartIdx - 1].trim().startsWith("[")) {
                    headerStartIdx--;
                }
                if (headerStartIdx < i) {
                    headerBlock = descriptionLines.slice(headerStartIdx, i).join("\n") + "\n\n";
                }

                let bestParseResult: KokopuParseResult | undefined = undefined;
                let fullPgnString = headerBlock + pgnAccumulator;

                while (currentLineIdx < descriptionLines.length) {
                    const candidatePgn = cleanPgn(fullPgnString);
                    const parsed = parseUsingKokopu(candidatePgn);
                    if (parsed) {
                        bestParseResult = parsed;
                    }

                    currentLineIdx++;
                    if (currentLineIdx < descriptionLines.length) {
                        const nextLine = descriptionLines[currentLineIdx].trim();
                        if (nextLine === "" || nextLine.startsWith("[")) {
                            if (bestParseResult) break;
                        }
                        fullPgnString += " " + nextLine;
                    }
                }

                if (bestParseResult) {
                    // Extract exact date tag directly from raw accumulated PGN string first
                    const rawHeaderDate = extractHeaderDate(fullPgnString);

                    resultArray.push({
                        source: PgnSource.LINE,
                        pgn: bestParseResult.pgn,
                        fen: bestParseResult.fen,
                        date: rawHeaderDate || bestParseResult.date,
                        lineIdx: headerStartIdx < i ? headerStartIdx : i
                    });

                    i = currentLineIdx - 1;
                }
            }
        }

        return resultArray;
    }
}

type KokopuParseResult = {
    pgn: string,
    fen: string,
    date?: string
}

function parseUsingKokopu(pgn: string): KokopuParseResult | undefined {
    try {
        const rawDate = extractHeaderDate(pgn);
        const database = pgnRead(pgn)
        const game = database.game(0)
        
        const kokopuDate = normalizePgnDate(game.date());

        const parsedPgn = pgnWrite(game)
            .replaceAll("\n", " ")
            .replaceAll(/\s{2,}/g, " ")
            .replaceAll(/\[.+]|\n/g, "")
            .replaceAll(/^\s+/g, "")

        const fen = game.finalPosition().fen()
        return {
            pgn: _.trim(parsedPgn),
            fen: fen,
            date: rawDate || kokopuDate
        }
    } catch (e) {
        if (pgn.endsWith("1/2-1/2")) {
            return undefined
        }
        let tmp = parseUsingKokopu(pgn + "1/2-1/2");
        return tmp == null
            ? undefined
            : {
                pgn: _.trim(tmp.pgn.replaceAll("1/2-1/2", "")),
                fen: tmp.fen,
                date: tmp.date
            }
    }
}

export async function extractPgnForId(id: string) {
    const videoSnippet = database.read(NAMESPACE_VIDEO_SNIPPET, id)
    if (!videoSnippet) {
        return
    }

    let games = await extractGames(videoSnippet.description, id);
    if (games.length > 0) {
        games = games.filter(game => game.playerWhite)
    }
    database.saveDescriptionGames(id, games)
}

export async function extractPgnForAll() {
    database.getAllIds().forEach(id => {
        extractPgnForId(id);
    })
}
