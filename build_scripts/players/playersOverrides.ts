const playersOverrides = new Map<string, PlayersOverride>(
    [
    ]
)

export default function getPlayersForId(id: string): PlayersOverride | undefined {
    return playersOverrides.get(id)
}

type PlayersOverride = {
    white: string,
    black: string
}
