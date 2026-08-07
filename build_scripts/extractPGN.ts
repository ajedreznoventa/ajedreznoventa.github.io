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
 * Directly extracts [Date "YYYY.MM.DD"] header from raw PGN string
 */
function extractHeaderDate(pgnString: string): string | undefined {
    const match = pgnString.match(/\[Date\s+"([^"]+)"\]/i);
    if (match && match[1]) {
        return normalizePgnDate(match[1]);
    }
    return undefined;
}

/**
 * Normalizes PGN date string (e.g., "1972.09.25" -> "1972-09-25")
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

function extractDateFromDescription(id: string, linesAbove: string): string | undefined {
    linesAbove = linesAbove.split('\n')
        .filter(line => !line.match(/game\s+of\s+the\s+day/i))
        .join('\n')

    const yyyyMMddRegex = /\s((1[4-9]\d\d)|(20\d\d))[.-](\d|0\d|1[0-2])[.-]([0-2]\d|3[01]|\d)/g
    let date = (linesAbove.match(yyyyMMddRegex) || [])
        .map(matched => _.trim(matched))
        .map(matched => matched.replaceAll(".", "-"))
        .map(matched => {
            let split = matched.split("-");
            return `${split[0]}-${_.padStart(split[1], 2, '0')}-${_.padStart(split[2], 2, '0')}`
        })[0]

    if (!date) {
        const ddMMyyyyRegex = /\s(\d|[0-2]\d|3[01])[.-](\d|0\d|1[0-2])[.-]((1[4-9]\d\d)|(20\d\d))/g
        date = (linesAbove.match(ddMMyyyyRegex) || [])
            .map(matched => _.trim(matched))
            .map(matched => matched.replaceAll(".", "-"))
            .map(matched => {
                let split = matched.split("-");
                return `${split[2]}-${_.padStart(split[1], 2, '0')}-${_.padStart(split[0], 2, '0')}`
            })[0]
    }

    if (!date) {
        const monthddyyyyRegex = /\s(Jan|Feb|Mar|Apr|Jul|Aug|Sept|Sep|Oct|Nov|Dec)[.-](\d|0\d|1[0-2])[.-]((1[4-9]\d\d)|(20\d\d))/g
        date = (linesAbove.match(monthddyyyyRegex) || [])
            .map(matched => _.trim(matched))
            .map(matched => matched
                .replaceAll(/(Jan|Feb|Mar|Apr|Jul|Aug|Sept|Sep|Oct|Nov|Dec)/g, month => translateMonth(month))
            )
            .map(matched => matched.replaceAll(".", "-"))
            .map(matched => {
                let split = matched.split("-");
                return `${split[2]}-${_.padStart(split[0], 2, '0')}-${_.padStart(split[1], 2, '0')}`
            })[0]
    }

    return date
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
            
            // PRIORITY: 1. Manual Override -> 2. PGN Tag Date -> 3. Description Regex Fallback
            const pgnDate = pgnExtractionResult.date;
            const date = dateOverrides[id] || pgnDate || extractDateFromDescription(id, linesAbove);

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
        // Updated Regex to include full PGN headers down to moves
        const pgnRegex = /(\[Event[\s\S]*?\]\s*\n\n|PGN:\s*)?11?\.(?!\.)(?! Ian).+\n/mg
        
        // Secondary check for raw blocks containing [Event ...] tags
        let matchArray = description.match(pgnRegex)

        // If the main move-based regex didn't capture headers, capture the entire PGN block directly
        let rawHeaderMatch = description.match(/\[Event[\s\S]*?\n\s*1\..*/g);
        let pgnToProcess = rawHeaderMatch && rawHeaderMatch.length > 0 ? rawHeaderMatch : matchArray;

        const resultArray: PgnExtraction[] = []
        if (pgnToProcess != null) {
            pgnToProcess
                .filter(pgn => pgn !== undefined && pgn !== null)
                .forEach(pgn => {
                    // Extract exact date tag directly from raw text before Kokopu cleans it
                    const rawHeaderDate = extractHeaderDate(pgn);

                    const fixedPgn = cleanPgn(pgn)
                    let parsedGame = parseUsingKokopu(fixedPgn);
                    if (parsedGame) {
                        let descriptionLines = description.split("\n");
                        let line = descriptionLines.find(l => l.indexOf(_.trim(pgn)) >= 0);
                        let initialLineIndex = line ? descriptionLines.indexOf(line) : undefined;

                        if (line && initialLineIndex && initialLineIndex >= 0) {
                            let lineIndex = initialLineIndex
                            let previousPgn = pgn
                            while (lineIndex < descriptionLines.length - 1) {
                                previousPgn = cleanPgn(previousPgn + " " + descriptionLines[++lineIndex])
                                let tmpParsed = parseUsingKokopu(previousPgn)
                                if (!tmpParsed) {
                                    break
                                } else {
                                    parsedGame = tmpParsed
                                }
                            }
                        }

                        resultArray.push({
                            source: PgnSource.LINE,
                            pgn: parsedGame.pgn,
                            fen: parsedGame.fen,
                            date: rawHeaderDate || parsedGame.date,
                            lineIdx: initialLineIndex
                        })
                    }
                })
        }
        return resultArray
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
