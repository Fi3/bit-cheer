port module Main exposing (main)

import Bitwise
import Browser
import Browser.Dom
import Browser.Events
import Dict exposing (Dict)
import Html exposing (Html, a, article, aside, button, canvas, div, footer, h1, h2, h3, header, img, input, label, li, main_, nav, option, p, section, select, small, span, strong, text, ul)
import Html.Attributes as A exposing (alt, attribute, checked, class, classList, disabled, href, id, selected, src, step, style, target, title, type_, value)
import Html.Events exposing (custom, on, onCheck, onClick, onInput, targetValue)
import Html.Keyed as Keyed
import Json.Decode as D
import Json.Encode as E
import Task


port command : E.Value -> Cmd msg


port incoming : (D.Value -> msg) -> Sub msg


type Page
    = Practice
    | Learning
    | Training
    | Skins


type alias Voice =
    { gain : Float, pan : Float, pattern : Int, preview : Int }


voiceNames : List String
voiceNames =
    [ "Kick", "Closed hat", "Snare", "Clap", "Bass", "Perc", "Synth", "Open hat", "Shaker", "Ride", "Crash", "Rim", "Low tom", "High tom", "Cowbell", "Conga", "Acid", "Chord", "Noise", "Zap" ]


defaultVoice : Voice
defaultVoice =
    { gain = 1, pan = 0, pattern = -1, preview = -1 }


type alias Deck =
    { name : String
    , bpm : Float
    , pitch : Float
    , playing : Bool
    , position : Float
    , duration : Float
    , beat : Float
    , peak : Float
    , elements : List Int
    , volume : Float
    , low : Float
    , mid : Float
    , high : Float
    , range : Float
    , loop : Bool
    , source : String
    , voices : List Voice
    , solo : Int
    , sensitivity : Float
    , genre : String
    , selectedTrack : String
    }


type alias Track =
    { id : String, name : String, artist : String, genre : String, bpm : Float, duration : Float }


type alias ReferenceTrack =
    { id : String, name : String, source : String, genre : String, bpm : Float }


type alias Result =
    { score : Int, tempoError : Float, phaseError : Float, message : String }


type alias OutputDevice =
    { id : String, label : String }


type alias OutputRouting =
    { maxChannels : Int
    , mode : String
    , a : Int
    , b : Int
    , devices : List OutputDevice
    , deviceId : String
    , canChooseOutput : Bool
    , canPickOutput : Bool
    }


type alias PlayerModule =
    { id : String, collapsed : Bool }


type alias ModuleLayout =
    { a : List PlayerModule, b : List PlayerModule, global : List PlayerModule }


type alias Flags =
    { basePath : String }


type alias Model =
    { page : Page
    , basePath : String
    , mode : String
    , a : Deck
    , b : Deck
    , crossfade : Float
    , master : Float
    , splitCue : Bool
    , routing : OutputRouting
    , routingOpen : Bool
    , routingRevision : Int
    , hideBpm : Bool
    , advanced : Bool
    , ready : Bool
    , notice : String
    , error : Bool
    , tapBpm : Float
    , taps : Int
    , micBpm : Float
    , micActive : Bool
    , skin : String
    , skinName : String
    , progress : List Int
    , history : List Int
    , currentLesson : Maybe Int
    , drill : String
    , result : Maybe Result
    , tracks : List Track
    , referenceTracks : List ReferenceTrack
    , referencePage : Int
    , genre : String
    , help : Bool
    , focused : Bool
    , layouts : Dict String ModuleLayout
    }


type Msg
    = Navigate Page
    | SetMode String
    | Play Int
    | PlayBoth
    | Cue Int
    | SetCue Int
    | SetGrid Int
    | Nudge Int Float
    | Pitch Int String
    | PitchStep Int Float
    | Range Int String
    | SourceBpm Int String
    | Loop Int Bool
    | Zoom Int Float
    | Element Int Int
    | AddElement Int
    | AddBothElements
    | RandomizeTempo Int
    | ChangeTrack Int
    | NewChallenge
    | AddInstrument Int String
    | VoiceValue Int Int String String
    | VoiceStep Int Int Int
    | ResetVoicePattern Int Int
    | SoloVoice Int Int
    | Chaos Int
    | FocusSession Bool
    | ToggleModule Int String
    | RemoveModule Int String
    | AddModule Int String
    | Sensitivity Int String
    | DeckGenre Int String
    | SelectTrack Int String
    | LoadSelectedTrack Int
    | PreviousTrack Int
    | NextTrack Int
    | DeckValue Int String String
    | Mixer String String
    | SplitCue Bool
    | ToggleRouting
    | RefreshOutputs
    | RoutingMode String
    | RoutingChannel Int String
    | SwapRouting
    | AudioOutput String
    | PickOutput
    | HideBpm Bool
    | Advanced Bool
    | Tap
    | Microphone
    | ImportTrack Int
    | LoadTrack Int String
    | Genre String
    | ReferencePage Int
    | SelectSkin String String
    | ImportSkin
    | ExportSkin
    | Check
    | StartLesson Int
    | StartDrill String
    | ToggleHelp
    | FocusHelp String
    | Receive D.Value
    | Key String
    | DismissNotice
    | NoOp


main : Program Flags Model Msg
main =
    Browser.element { init = init, update = update, view = view, subscriptions = subscriptions }


initialDeck : String -> Float -> Deck
initialDeck name bpm =
    { name = name, bpm = bpm, pitch = 0, playing = False, position = 0, duration = 32 * 60 / bpm, beat = 0, peak = 0, elements = [ 0 ], volume = 0.8, low = 0, mid = 0, high = 0, range = 8, loop = True, source = "generated", voices = List.repeat 20 defaultVoice, solo = -1, sensitivity = 0.05, genre = "All genres", selectedTrack = "" }


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( { page = Practice
      , basePath = flags.basePath
      , mode = "foundation"
      , a = initialDeck "Four to the floor · 01" 120
      , b = initialDeck "Four to the floor · 02" 124
      , crossfade = 0.5
      , master = 0.75
      , splitCue = False
      , routing = { maxChannels = 0, mode = "mix", a = 0, b = 1, devices = [], deviceId = "default", canChooseOutput = False, canPickOutput = False }
      , routingOpen = False
      , routingRevision = 0
      , hideBpm = False
      , advanced = False
      , ready = False
      , notice = ""
      , error = False
      , tapBpm = 0
      , taps = 0
      , micBpm = 0
      , micActive = False
      , skin = "classified5"
      , skinName = "Winamp5_Classified_v5.5"
      , progress = []
      , history = []
      , currentLesson = Just 1
      , drill = ""
      , result = Nothing
      , tracks = []
      , referenceTracks = []
      , referencePage = 0
      , genre = "All genres"
      , help = False
      , focused = False
      , layouts = Dict.fromList (List.map (\mode -> ( mode, defaultModuleLayout mode )) [ "foundation", "builder", "blind", "pro" ])
      }
    , send "init" []
    )


send : String -> List ( String, E.Value ) -> Cmd Msg
send typeName fields =
    command (E.object (( "type", E.string typeName ) :: fields))


set : Int -> String -> Float -> Cmd Msg
set deck param val =
    send "set" [ ( "deck", E.int deck ), ( "param", E.string param ), ( "value", E.float val ) ]


getDeck : Int -> Model -> Deck
getDeck deck model =
    if deck == 0 then
        model.a

    else
        model.b


mapDeck : Int -> (Deck -> Deck) -> Model -> Model
mapDeck deck fn model =
    if deck == 0 then
        { model | a = fn model.a }

    else
        { model | b = fn model.b }


mask : List Int -> Int
mask elements =
    List.sum (List.map (\n -> 2 ^ n) elements)


asFloat : Float -> String -> Float
asFloat fallback str =
    String.toFloat str |> Maybe.withDefault fallback


persist : Model -> Cmd Msg
persist model =
    send "persist" [ ( "progress", E.list E.int model.progress ), ( "history", E.list E.int model.history ) ]


modeElements : String -> List Int
modeElements mode =
    case mode of
        "foundation" ->
            [ 0 ]

        "builder" ->
            [ 0, 1 ]

        _ ->
            [ 0, 1, 2, 4 ]


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Navigate page ->
            ( { model | page = page }, Cmd.none )

        SetMode mode ->
            let
                elements =
                    modeElements mode

                prepare deck =
                    let
                        nextDeck =
                            resetDeck elements deck
                    in
                    if mode == "foundation" then
                        { nextDeck | low = 0, mid = 0, high = 0 }

                    else
                        nextDeck

                next =
                    { model | mode = mode, a = prepare model.a, b = prepare model.b, hideBpm = mode == "blind", advanced = mode /= "foundation" && model.advanced, result = Nothing, drill = "", currentLesson = Nothing, page = Practice }
            in
            ( next, send "mode" [ ( "mode", E.string mode ), ( "elements", E.int (mask elements) ) ] )

        Play deck ->
            let
                playing =
                    not (getDeck deck model).playing
            in
            ( mapDeck deck (\d -> { d | playing = playing }) model, set deck "play" (boolNumber playing) )

        PlayBoth ->
            let
                playing =
                    not (model.a.playing || model.b.playing)
            in
            ( { model | a = withPlaying playing model.a, b = withPlaying playing model.b }, Cmd.batch [ set 0 "play" (boolNumber playing), set 1 "play" (boolNumber playing) ] )

        Cue deck ->
            ( mapDeck deck (\d -> { d | playing = False, position = 0 }) model, send "cue" [ ( "deck", E.int deck ) ] )

        SetCue deck ->
            ( { model | notice = "Cue point saved. Press CUE to return to it.", error = False }, send "setCue" [ ( "deck", E.int deck ) ] )

        SetGrid deck ->
            ( { model | notice = "Beat one anchored at the current position. Phase checks now follow this downbeat.", error = False }, send "grid" [ ( "deck", E.int deck ) ] )

        Nudge deck amount ->
            ( model, send "nudge" [ ( "deck", E.int deck ), ( "value", E.float amount ) ] )

        Pitch deck raw ->
            let
                d =
                    getDeck deck model

                pitch =
                    clamp -d.range d.range (asFloat d.pitch raw)
            in
            ( mapDeck deck (\old -> { old | pitch = pitch }) model, set deck "pitch" pitch )

        PitchStep deck amount ->
            update (Pitch deck (String.fromFloat ((getDeck deck model).pitch + amount))) model

        Range deck raw ->
            let
                range =
                    asFloat 8 raw

                pitch =
                    clamp -range range (getDeck deck model).pitch
            in
            ( mapDeck deck (\d -> { d | range = range, pitch = pitch }) model, set deck "pitch" pitch )

        SourceBpm deck raw ->
            let
                bpm =
                    clamp 40 300 (asFloat (getDeck deck model).bpm raw)
            in
            ( mapDeck deck (\d -> { d | bpm = bpm }) model, set deck "bpm" bpm )

        Loop deck enabled ->
            ( mapDeck deck (\d -> { d | loop = enabled }) model, set deck "loop" (boolNumber enabled) )

        Zoom deck factor ->
            ( model, send "zoom" [ ( "deck", E.int deck ), ( "value", E.float factor ) ] )

        Element deck element ->
            let
                current =
                    (getDeck deck model).elements

                elements =
                    if List.member element current then
                        List.filter ((/=) element) current

                    else
                        current ++ [ element ]

                removingSolo =
                    (getDeck deck model).solo == element && List.member element current
            in
            ( mapDeck deck
                (\d ->
                    { d
                        | elements = elements
                        , solo =
                            if removingSolo then
                                -1

                            else
                                d.solo
                    }
                )
                model
            , Cmd.batch
                [ set deck "elements" (toFloat (mask elements))
                , if removingSolo then
                    send "solo" [ ( "deck", E.int deck ), ( "voice", E.int -1 ) ]

                  else
                    Cmd.none
                ]
            )

        AddElement deck ->
            let
                nextDeck =
                    addNextElement (getDeck deck model)
            in
            ( mapDeck deck (\_ -> nextDeck) model, set deck "elements" (toFloat (mask nextDeck.elements)) )

        AddBothElements ->
            let
                next =
                    { model | a = addNextElement model.a, b = addNextElement model.b }
            in
            ( next, Cmd.batch [ set 0 "elements" (toFloat (mask next.a.elements)), set 1 "elements" (toFloat (mask next.b.elements)) ] )

        RandomizeTempo deck ->
            ( model, send "randomizeTempo" [ ( "deck", E.int deck ), ( "mode", E.string model.mode ) ] )

        ChangeTrack deck ->
            ( model, send "changeTrack" [ ( "deck", E.int deck ), ( "mode", E.string model.mode ), ( "genre", E.string (getDeck deck model).genre ) ] )

        NewChallenge ->
            ( { model | result = Nothing }, send "newChallenge" [ ( "mode", E.string model.mode ), ( "elements", E.int (mask model.a.elements) ), ( "drill", E.string model.drill ) ] )

        AddInstrument deck raw ->
            case String.toInt raw of
                Just voice ->
                    if voice >= 0 && voice < 20 && not (List.member voice (getDeck deck model).elements) then
                        update (Element deck voice) model

                    else
                        ( model, Cmd.none )

                Nothing ->
                    ( model, Cmd.none )

        VoiceValue deck voice param raw ->
            let
                val =
                    asFloat
                        (if param == "gain" then
                            1

                         else
                            0
                        )
                        raw

                change old =
                    if param == "gain" then
                        { old | gain = clamp 0 1.5 val }

                    else
                        { old | pan = clamp -1 1 val }
            in
            ( mapVoice deck voice change model, sendVoice deck voice param val )

        VoiceStep deck voice stepIndex ->
            let
                current =
                    getVoice voice (getDeck deck model)

                base =
                    if current.pattern >= 0 then
                        current.pattern

                    else
                        Basics.max 0 current.preview

                pattern =
                    Bitwise.xor base (Bitwise.shiftLeftBy stepIndex 1)
            in
            ( mapVoice deck voice (\old -> { old | pattern = pattern, preview = pattern }) model, sendVoice deck voice "pattern" (toFloat pattern) )

        ResetVoicePattern deck voice ->
            ( mapVoice deck voice (\old -> { old | pattern = -1, preview = -1 }) model, sendVoice deck voice "reset" 0 )

        SoloVoice deck voice ->
            let
                solo =
                    if (getDeck deck model).solo == voice then
                        -1

                    else
                        voice
            in
            ( mapDeck deck (\old -> { old | solo = solo }) model, send "solo" [ ( "deck", E.int deck ), ( "voice", E.int solo ) ] )

        Chaos deck ->
            ( model, send "chaos" [ ( "deck", E.int deck ) ] )

        FocusSession active ->
            ( { model | focused = active }, send "focusSession" [ ( "active", E.bool active ) ] )

        ToggleModule scope moduleId ->
            changeModules scope
                (List.map
                    (\item ->
                        if item.id == moduleId then
                            { item | collapsed = not item.collapsed }

                        else
                            item
                    )
                )
                model

        RemoveModule scope moduleId ->
            changeModules scope (List.filter (\item -> item.id /= moduleId)) model

        AddModule scope moduleId ->
            if List.member moduleId (List.map Tuple.first (availableModules scope model)) then
                changeModules scope
                    (\items ->
                        if List.any (\item -> item.id == moduleId) items then
                            items

                        else
                            items ++ [ { id = moduleId, collapsed = moduleId == "discovery" } ]
                    )
                    model

            else
                ( model, Cmd.none )

        Sensitivity deck raw ->
            let
                val =
                    asFloat 0.05 raw

                next =
                    mapDeck deck
                        (\current ->
                            { current
                                | sensitivity =
                                    if List.member val [ 0.01, 0.05, 0.25 ] then
                                        val

                                    else
                                        0.05
                            }
                        )
                        model
            in
            ( next, Cmd.batch [ send "sensitivity" [ ( "deck", E.int deck ), ( "value", E.float (getDeck deck next).sensitivity ) ], persistLayout next ] )

        DeckGenre deck genre ->
            ( mapDeck deck (\current -> { current | genre = genre, selectedTrack = "" }) model, Cmd.none )

        SelectTrack deck trackId ->
            ( mapDeck deck (\current -> { current | selectedTrack = trackId }) model, Cmd.none )

        LoadSelectedTrack deck ->
            case selectedPlayable model (getDeck deck model) of
                Just track ->
                    ( model, send "loadTrack" [ ( "deck", E.int deck ), ( "track", E.string track.id ) ] )

                Nothing ->
                    ( model, Cmd.none )

        PreviousTrack deck ->
            ( model, send "previousTrack" [ ( "deck", E.int deck ), ( "genre", E.string (getDeck deck model).genre ) ] )

        NextTrack deck ->
            ( model, send "nextTrack" [ ( "deck", E.int deck ), ( "genre", E.string (getDeck deck model).genre ) ] )

        DeckValue deck param raw ->
            let
                val =
                    asFloat 0 raw

                change d =
                    case param of
                        "volume" ->
                            { d | volume = val }

                        "low" ->
                            { d | low = val }

                        "mid" ->
                            { d | mid = val }

                        _ ->
                            { d | high = val }
            in
            ( mapDeck deck change model, set deck param val )

        Mixer param raw ->
            let
                val =
                    asFloat 0.5 raw

                next =
                    if param == "crossfade" then
                        { model | crossfade = val }

                    else
                        { model | master = val }
            in
            ( next, send "mixer" [ ( "param", E.string param ), ( "value", E.float val ) ] )

        SplitCue enabled ->
            ( { model | splitCue = enabled }, send "mixer" [ ( "param", E.string "splitCue" ), ( "value", E.float (boolNumber enabled) ) ] )

        ToggleRouting ->
            ( { model | routingOpen = not model.routingOpen }
            , if model.routingOpen then
                Cmd.none

              else
                send "refreshOutputs" []
            )

        RefreshOutputs ->
            ( model, send "refreshOutputs" [] )

        RoutingMode routeMode ->
            ( model
            , requestRouting routeMode
                0
                (if routeMode == "stereo" then
                    2

                 else
                    1
                )
            )

        RoutingChannel deck channel ->
            let
                index =
                    String.toInt channel
                        |> Maybe.withDefault
                            (if deck == 0 then
                                model.routing.a

                             else
                                model.routing.b
                            )
            in
            ( model
            , requestRouting model.routing.mode
                (if deck == 0 then
                    index

                 else
                    model.routing.a
                )
                (if deck == 1 then
                    index

                 else
                    model.routing.b
                )
            )

        SwapRouting ->
            ( model, requestRouting model.routing.mode model.routing.b model.routing.a )

        AudioOutput deviceId ->
            ( model, send "audioOutput" [ ( "deviceId", E.string deviceId ) ] )

        PickOutput ->
            ( model, send "pickOutput" [] )

        HideBpm enabled ->
            ( { model | hideBpm = enabled }, send "visuals" [ ( "hidden", E.bool enabled ) ] )

        Advanced enabled ->
            ( { model | advanced = enabled }, Cmd.none )

        Tap ->
            ( model, send "tap" [] )

        Microphone ->
            ( model, send "mic" [] )

        ImportTrack deck ->
            ( model, send "importTrack" [ ( "deck", E.int deck ) ] )

        LoadTrack deck track ->
            ( model, send "loadTrack" [ ( "deck", E.int deck ), ( "track", E.string track ) ] )

        Genre genre ->
            ( { model | genre = genre, referencePage = 0 }, Cmd.none )

        ReferencePage page ->
            ( { model | referencePage = Basics.max 0 page }, Cmd.none )

        SelectSkin skin name ->
            ( { model | skin = skin, skinName = name }, send "skin" [ ( "id", E.string skin ) ] )

        ImportSkin ->
            ( model, send "importSkin" [] )

        ExportSkin ->
            ( model, send "exportSkin" [] )

        Check ->
            ( model, send "check" [ ( "drill", E.string model.drill ) ] )

        StartLesson lessonId ->
            case List.head (List.filter (\l -> l.number == lessonId) lessons) of
                Nothing ->
                    ( model, Cmd.none )

                Just lesson ->
                    let
                        ( next, _ ) =
                            update (SetMode lesson.mode) model

                        elements =
                            lesson.elements
                    in
                    ( { next | currentLesson = Just lessonId, a = resetDeck elements next.a, b = resetDeck elements next.b, notice = lesson.instruction, error = False, hideBpm = lessonId == 6 || lessonId == 8, advanced = lessonId >= 5 }
                    , send "lesson" [ ( "lesson", E.int lessonId ), ( "mode", E.string lesson.mode ), ( "elements", E.int (mask elements) ), ( "hidden", E.bool (lessonId == 6 || lessonId == 8) ) ]
                    )

        StartDrill drill ->
            let
                mode =
                    if drill == "blind" then
                        "blind"

                    else
                        "builder"

                ( next, _ ) =
                    update (SetMode mode) model
            in
            ( { next | drill = drill, currentLesson = Nothing, notice = drillInstruction drill, error = False }, send "drill" [ ( "drill", E.string drill ), ( "mode", E.string mode ), ( "elements", E.int (mask next.a.elements) ) ] )

        ToggleHelp ->
            ( { model | help = not model.help }
            , Task.attempt (\_ -> NoOp)
                (Browser.Dom.focus
                    (if model.help then
                        "help-open"

                     else
                        "help-close"
                    )
                )
            )

        FocusHelp controlId ->
            ( model, Task.attempt (\_ -> NoOp) (Browser.Dom.focus controlId) )

        Receive data ->
            receive data model

        Key key ->
            case String.toLower key of
                "escape" ->
                    if model.focused then
                        update (FocusSession False) model

                    else
                        ( { model | help = False }, Task.attempt (\_ -> NoOp) (Browser.Dom.focus "help-open") )

                " " ->
                    update PlayBoth model

                "t" ->
                    update Tap model

                "a" ->
                    update (Play 0) model

                "b" ->
                    update (Play 1) model

                "arrowleft" ->
                    update (Nudge 1 -0.04) model

                "arrowright" ->
                    update (Nudge 1 0.04) model

                _ ->
                    ( model, Cmd.none )

        DismissNotice ->
            ( { model | notice = "" }, Cmd.none )

        NoOp ->
            ( model, Cmd.none )


requestRouting : String -> Int -> Int -> Cmd Msg
requestRouting routeMode channelA channelB =
    send "routing" [ ( "mode", E.string routeMode ), ( "a", E.int channelA ), ( "b", E.int channelB ) ]


addNextElement : Deck -> Deck
addNextElement deck =
    case List.head (List.filter (\n -> not (List.member n deck.elements)) (List.range 0 19)) of
        Just element ->
            { deck | elements = deck.elements ++ [ element ] }

        Nothing ->
            deck


elementsFromMask : Int -> List Int
elementsFromMask bits =
    List.filter (\n -> modBy 2 (bits // (2 ^ n)) == 1) (List.range 0 19)


getVoice : Int -> Deck -> Voice
getVoice voice deck =
    List.head (List.drop voice deck.voices) |> Maybe.withDefault defaultVoice


mapVoice : Int -> Int -> (Voice -> Voice) -> Model -> Model
mapVoice deck voice change model =
    mapDeck deck
        (\old ->
            { old
                | voices =
                    List.indexedMap
                        (\index item ->
                            if index == voice then
                                change item

                            else
                                item
                        )
                        old.voices
            }
        )
        model


sendVoice : Int -> Int -> String -> Float -> Cmd Msg
sendVoice deck voice param val =
    send "voice" [ ( "deck", E.int deck ), ( "voice", E.int voice ), ( "param", E.string param ), ( "value", E.float val ) ]


voiceDecoder : D.Decoder Voice
voiceDecoder =
    D.map4 Voice
        (D.oneOf [ D.field "gain" D.float, D.succeed 1 ])
        (D.oneOf [ D.field "pan" D.float, D.succeed 0 ])
        (D.oneOf [ D.field "pattern" D.int, D.succeed -1 ])
        (D.oneOf [ D.field "preview" D.int, D.succeed -1 ])


resetDeck : List Int -> Deck -> Deck
resetDeck elements deck =
    { deck | elements = elements, pitch = 0, playing = False, position = 0, beat = 0, loop = True, solo = -1 }


fitPitchRange : Float -> Float -> Float
fitPitchRange current pitch =
    if abs pitch <= current then
        current

    else
        List.filter (\range -> range >= abs pitch) [ 2, 4, 8, 16, 32, 50 ]
            |> List.head
            |> Maybe.withDefault 50


withPlaying : Bool -> Deck -> Deck
withPlaying playing deck =
    { deck | playing = playing }


boolNumber : Bool -> Float
boolNumber val =
    if val then
        1

    else
        0


field : String -> D.Decoder a -> a -> D.Value -> a
field name decoder fallback data =
    D.decodeValue (D.field name decoder) data |> Result.withDefault fallback


receive : D.Value -> Model -> ( Model, Cmd Msg )
receive data model =
    case field "type" D.string "" data of
        "ready" ->
            ( { model | ready = True }, Cmd.none )

        "notice" ->
            ( { model | notice = field "message" D.string "" data, error = False }, Cmd.none )

        "error" ->
            ( { model | notice = field "message" D.string "Something went wrong. Please try again." data, error = True }, Cmd.none )

        "routing" ->
            let
                previous =
                    model.routing

                routing =
                    { maxChannels = field "maxChannels" D.int previous.maxChannels data
                    , mode = field "mode" D.string previous.mode data
                    , a = field "a" D.int previous.a data
                    , b = field "b" D.int previous.b data
                    , devices = field "devices" (D.list (D.map2 OutputDevice (D.field "id" D.string) (D.field "label" D.string))) previous.devices data
                    , deviceId = field "deviceId" D.string previous.deviceId data
                    , canChooseOutput = field "canChooseOutput" D.bool previous.canChooseOutput data
                    , canPickOutput = field "canPickOutput" D.bool previous.canPickOutput data
                    }
            in
            ( { model | routing = routing, routingRevision = model.routingRevision + 1 }, Cmd.none )

        "telemetry" ->
            let
                decks =
                    field "decks" (D.list D.value) [] data

                apply index current =
                    case List.head (List.drop index decks) of
                        Nothing ->
                            current

                        Just d ->
                            { current
                                | position = field "position" D.float current.position d
                                , duration = field "duration" D.float current.duration d
                                , beat = field "beat" D.float current.beat d
                                , peak = field "peak" D.float current.peak d
                                , playing = field "playing" D.bool current.playing d
                            }
            in
            ( { model | a = apply 0 model.a, b = apply 1 model.b }, Cmd.none )

        "restoreLayout" ->
            let
                layoutData =
                    field "layout" D.value E.null data

                modes =
                    field "modes" (D.dict moduleLayoutDecoder) model.layouts layoutData

                sensitivities =
                    field "sensitivity" (D.list D.float) [ 0.05, 0.05 ] layoutData

                sensitivity index =
                    List.head (List.drop index sensitivities) |> Maybe.withDefault 0.05

                next =
                    { model | layouts = modes }
            in
            ( mapDeck 0 (\deck -> { deck | sensitivity = sensitivity 0 }) next |> mapDeck 1 (\deck -> { deck | sensitivity = sensitivity 1 }), Cmd.none )

        "trackSelection" ->
            let
                deck =
                    field "deck" D.int 0 data
            in
            ( mapDeck deck (\current -> { current | selectedTrack = field "track" D.string current.selectedTrack data, genre = field "genre" D.string current.genre data }) model, Cmd.none )

        "focus" ->
            ( { model | focused = field "active" D.bool (field "deck" D.int -1 data >= 0) data }, Cmd.none )

        "pitchChanged" ->
            let
                deck =
                    field "deck" D.int 0 data
            in
            ( mapDeck deck
                (\current ->
                    let
                        pitch =
                            field "pitch" D.float current.pitch data
                    in
                    { current | pitch = pitch, range = fitPitchRange current.range pitch }
                )
                model
            , Cmd.none
            )

        "voices" ->
            let
                deck =
                    field "deck" D.int 0 data
            in
            ( mapDeck deck (\current -> { current | voices = field "voices" (D.list voiceDecoder) current.voices data, solo = field "solo" D.int current.solo data }) model, Cmd.none )

        "solo" ->
            let
                deck =
                    field "deck" D.int 0 data
            in
            ( mapDeck deck (\current -> { current | solo = field "voice" D.int current.solo data }) model, Cmd.none )

        "deckChanged" ->
            let
                deck =
                    field "deck" D.int 0 data

                change current =
                    let
                        pitch =
                            field "pitch" D.float current.pitch data
                    in
                    { current
                        | name = field "name" D.string current.name data
                        , bpm = field "bpm" D.float current.bpm data
                        , pitch = pitch
                        , range = fitPitchRange current.range pitch
                        , elements = field "elements" D.int (mask current.elements) data |> elementsFromMask
                        , duration = field "duration" D.float current.duration data
                        , source = field "source" D.string current.source data
                        , position = field "position" D.float current.position data
                        , playing = field "playing" D.bool current.playing data
                        , voices = field "voices" (D.list voiceDecoder) current.voices data
                        , solo = field "solo" D.int current.solo data
                        , selectedTrack = field "trackId" D.string current.selectedTrack data
                    }
            in
            ( mapDeck deck change { model | result = Nothing }, Cmd.none )

        "track" ->
            let
                deck =
                    field "deck" D.int 0 data

                bpm =
                    field "bpm" D.float 120 data
            in
            ( mapDeck deck (\d -> { d | name = field "name" D.string d.name data, bpm = bpm, duration = field "duration" D.float (32 * 60 / bpm) data, pitch = 0, position = 0, playing = False, source = "pcm", selectedTrack = field "trackId" D.string d.selectedTrack data }) model, Cmd.none )

        "randomized" ->
            let
                bpms =
                    field "bpms" (D.list D.float) [ 120, 124 ] data

                names =
                    field "names" (D.list D.string) [ "Four to the floor · 01", "Four to the floor · 02" ] data

                apply index d =
                    let
                        bpm =
                            List.head (List.drop index bpms) |> Maybe.withDefault d.bpm
                    in
                    { d | bpm = bpm, name = List.head (List.drop index names) |> Maybe.withDefault d.name, pitch = 0, position = 0, duration = 32 * 60 / bpm, source = "generated" }
            in
            ( { model | a = apply 0 model.a, b = apply 1 model.b }, Cmd.none )

        "tap" ->
            ( { model | tapBpm = field "bpm" D.float 0 data, taps = field "taps" D.int 0 data }, Cmd.none )

        "mic" ->
            ( { model | micBpm = field "bpm" D.float 0 data, micActive = field "active" D.bool False data }, Cmd.none )

        "skin" ->
            ( { model | skin = field "id" D.string model.skin data, skinName = field "name" D.string model.skinName data }, Cmd.none )

        "restore" ->
            ( { model | progress = field "progress" (D.list D.int) [] data, history = field "history" (D.list D.int) [] data }, Cmd.none )

        "referenceCatalog" ->
            ( { model | referenceTracks = field "tracks" (D.list referenceDecoder) [] data }, Cmd.none )

        "catalog" ->
            ( { model | tracks = field "tracks" (D.list trackDecoder) [] data }, Cmd.none )

        "result" ->
            let
                result =
                    { score = field "score" D.int 0 data
                    , tempoError = field "tempoError" D.float 0 data
                    , phaseError = field "phaseError" D.float 0 data
                    , message = field "message" D.string "Keep listening and adjusting." data
                    }

                progress =
                    case model.currentLesson of
                        Just lessonId ->
                            if result.score >= 85 && not (List.member lessonId model.progress) then
                                model.progress ++ [ lessonId ]

                            else
                                model.progress

                        Nothing ->
                            model.progress

                next =
                    { model | result = Just result, history = List.take 50 (result.score :: model.history), progress = progress }
            in
            ( next, persist next )

        _ ->
            ( model, Cmd.none )


trackDecoder : D.Decoder Track
trackDecoder =
    D.map6 Track
        (D.field "id" D.string)
        (D.field "name" D.string)
        (D.oneOf [ D.field "artist" D.string, D.succeed "Practice library" ])
        (D.field "genre" D.string)
        (D.field "bpm" D.float)
        (D.oneOf [ D.field "duration" D.float, D.succeed 0 ])


referenceDecoder : D.Decoder ReferenceTrack
referenceDecoder =
    D.map5 ReferenceTrack
        (D.field "id" D.string)
        (D.field "name" D.string)
        (D.field "source" D.string)
        (D.field "genre" D.string)
        (D.oneOf [ D.field "bpm" D.float, D.succeed 0 ])


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ incoming Receive
        , Browser.Events.onKeyDown
            (D.map3 (\ctrl meta altKey -> ctrl || meta || altKey)
                (D.field "ctrlKey" D.bool)
                (D.field "metaKey" D.bool)
                (D.field "altKey" D.bool)
                |> D.andThen
                    (\modified ->
                        if modified then
                            D.fail "Browser shortcut"

                        else if model.help then
                            D.field "key" D.string
                                |> D.andThen
                                    (\key ->
                                        if key == "Escape" then
                                            D.succeed (Key key)

                                        else
                                            D.fail "Dialog handles keyboard"
                                    )

                        else
                            D.field "key" D.string
                                |> D.andThen
                                    (\key ->
                                        if key == "Escape" && model.focused then
                                            D.succeed (Key key)

                                        else
                                            D.field "target" (D.map2 Tuple.pair (D.field "tagName" D.string) (D.oneOf [ D.field "role" D.string, D.succeed "" ]))
                                                |> D.andThen
                                                    (\( tag, role ) ->
                                                        if model.focused && key == " " && tag == "INPUT" then
                                                            D.at [ "target", "type" ] D.string
                                                                |> D.andThen
                                                                    (\inputType ->
                                                                        if inputType == "range" then
                                                                            D.succeed (Key key)

                                                                        else
                                                                            D.fail "Native control handles keyboard"
                                                                    )

                                                        else if List.member tag [ "INPUT", "SELECT", "TEXTAREA", "BUTTON" ] || role == "slider" then
                                                            D.fail "Native control handles keyboard"

                                                        else
                                                            D.field "key" D.string |> D.map Key
                                                    )
                                    )
                    )
            )
        ]


view : Model -> Html Msg
view model =
    if model.focused then
        focusView model

    else
        normalView model


focusView : Model -> Html Msg
focusView model =
    div [ class "app-shell session-focus-view", attribute "data-mode" model.mode ]
        [ header [ class "focus-toolbar" ]
            [ h1 [] [ text "BIT.CHEER // FOCUS SESSION" ]
            , small [] [ text "SPACE PLAYS BOTH · ESC EXITS" ]
            , button [ class "exit-focus-button", onClick (FocusSession False), attribute "aria-label" "Exit session focus" ] [ text "Exit focus ✕" ]
            ]
        , if model.error && not (String.isEmpty model.notice) then
            noticeView model

          else
            text ""
        , main_ [ class "focus-decks", id "main-content" ]
            (List.map
                (\number ->
                    let
                        deck =
                            getDeck number model

                        letter =
                            deckLetter number
                    in
                    section [ class "focus-channel", attribute "data-deck" (String.fromInt number), attribute "aria-label" ("Deck " ++ letter) ]
                        [ h2 [] [ text ("DECK " ++ letter) ]
                        , div [ class "focus-transport" ]
                            [ button [ classList [ ( "focus-play-button", True ), ( "engaged", deck.playing ) ], onClick (Play number), disabled deck.playing, attribute "aria-label" ("Play deck " ++ letter) ] [ text "▶ Play" ]
                            , button [ class "focus-pause-button", onClick (Play number), disabled (not deck.playing), attribute "aria-label" ("Pause deck " ++ letter) ] [ text "Ⅱ Pause" ]
                            ]
                        , pitchView number deck
                        , volumeView number deck
                        ]
                )
                [ 0, 1 ]
            )
        ]


normalView : Model -> Html Msg
normalView model =
    div [ class "app-shell", attribute "data-mode" model.mode ]
        [ topbar model
        , div [ class "workspace" ]
            [ sidebar model
            , main_ [ class "main-content", id "main-content" ]
                [ noticeView model
                , case model.page of
                    Practice ->
                        practiceView model

                    Learning ->
                        learningView model

                    Training ->
                        trainingView model

                    Skins ->
                        skinsView model
                ]
            ]
        , footer [ class "footer" ]
            [ span [] [ span [ class "status-dot" ] [], text " Built for the ears. Inspired by the era." ]
            , span [] [ text "ELM + RUST / WASM", span [ class "footer-separator" ] [ text "·" ], text "BIT.CHEER v1.0", span [ class "footer-separator" ] [ text "·" ], a [ href (model.basePath ++ "credits.html"), target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Credits & sources ↗" ] ]
            ]
        , if model.help then
            helpView

          else
            text ""
        ]


topbar : Model -> Html Msg
topbar model =
    header [ class "topbar" ]
        [ a [ class "skip-link", href "#main-content" ] [ text "Skip to practice" ]
        , button [ class "brand", onClick (Navigate Practice), attribute "aria-label" "Bit Cheer home" ]
            [ span [ class "brand-mark" ] [ text "ϟ" ]
            , span [ class "brand-word" ] [ text "bit", span [] [ text "." ], text "cheer" ]
            , span [ class "brand-tag" ] [ text "BEATMATCH LAB" ]
            ]
        , nav [ class "main-nav", attribute "aria-label" "Main navigation" ]
            (List.map
                (\( page, name ) -> button [ classList [ ( "nav-item", True ), ( "active", model.page == page ) ], onClick (Navigate page) ] [ text name ])
                [ ( Practice, "Practice" ), ( Learning, "Learning path" ), ( Training, "Training" ), ( Skins, "Skin studio" ) ]
            )
        , div [ class "topbar-right" ]
            [ span [ classList [ ( "engine-status", True ), ( "online", model.ready ) ], title "Audio starts when you press play" ]
                [ span [ class "status-dot" ] []
                , text
                    (if model.ready then
                        "ENGINE READY"

                     else
                        "CLICK PLAY TO START"
                    )
                ]
            , button [ id "help-open", class "help-button", onClick ToggleHelp, attribute "aria-label" "Keyboard shortcuts and help" ] [ text "?" ]
            ]
        ]


sidebar : Model -> Html Msg
sidebar model =
    aside [ class "sidebar" ]
        [ div [ class "sidebar-heading" ] [ span [] [ text "YOUR PLAYGROUND" ], small [] [ text "01—04" ] ]
        , nav [ class "mode-list", attribute "aria-label" "Practice mode" ]
            (List.map
                (\( mode, ( number, name, description ) ) ->
                    button [ classList [ ( "mode-card", True ), ( "selected", mode == model.mode ) ], onClick (SetMode mode) ]
                        [ span [ class "mode-number" ] [ text number ]
                        , span [ class "mode-copy" ] [ strong [] [ text name ], small [] [ text description ] ]
                        , span [ class "mode-arrow" ] [ text "↗" ]
                        ]
                )
                [ ( "foundation", ( "01", "Foundation", "Two kicks. One groove." ) )
                , ( "builder", ( "02", "Loop builder", "Layer up the challenge." ) )
                , ( "blind", ( "03", "By ear", "Trust what you hear." ) )
                , ( "pro", ( "04", "Pro decks", "Real tracks. Real skills." ) )
                ]
            )
        , div [ class "sidebar-progress" ]
            [ div [ class "eyebrow" ] [ text "SMALL STEPS. TIGHTER MIXES." ]
            , div [ class "progress-heading" ] [ strong [] [ text "Your learning path" ], span [] [ text (String.fromInt (List.length model.progress) ++ "/8") ] ]
            , div [ class "progress-track" ] [ div [ style "width" (String.fromFloat (toFloat (List.length model.progress) / 8 * 100) ++ "%") ] [] ]
            , p []
                [ text
                    (if List.isEmpty model.progress then
                        "Every great set starts with a beat."

                     else
                        "Your ears are getting sharper. Keep going."
                    )
                ]
            , button [ class "text-button", onClick (Navigate Learning) ] [ text "Continue learning", span [] [ text "→" ] ]
            ]
        , div [ class "sidebar-bottom" ]
            [ div [ class "headphone-icon" ] [ text "◖ ◗" ]
            , strong [] [ text "Headphones on." ]
            , p [] [ text "A little focus goes a long way. Listen to the kick, feel the drift." ]
            , button [ class "shortcut-link", onClick ToggleHelp ] [ text "⌨ Keyboard shortcuts" ]
            ]
        ]


noticeView : Model -> Html Msg
noticeView model =
    if String.isEmpty model.notice then
        text ""

    else
        div
            [ classList [ ( "notice", True ), ( "error", model.error ) ]
            , attribute "role"
                (if model.error then
                    "alert"

                 else
                    "status"
                )
            ]
            [ span [] [ text model.notice ], button [ onClick DismissNotice, attribute "aria-label" "Dismiss notification" ] [ text "×" ] ]


modeName : String -> String
modeName mode =
    case mode of
        "builder" ->
            "Build your groove."

        "blind" ->
            "Let your ears lead."

        "pro" ->
            "Make the mix yours."

        _ ->
            "Find your rhythm."


modeDescription : String -> String
modeDescription mode =
    case mode of
        "builder" ->
            "Add a little texture. Keep the beats together as the groove gets richer."

        "blind" ->
            "The numbers are off. Listen for the drift and bring two rhythms together."

        "pro" ->
            "Pick a genre or bring your own tracks. This is where practice meets the dance floor."

        _ ->
            "Two clean kick drums. Learn to match their speed, then bring each hit together."


practiceView : Model -> Html Msg
practiceView model =
    div [ class "practice-page" ]
        [ div [ class "page-heading" ]
            [ div []
                [ div [ class "eyebrow" ] [ text "THE ART OF BEATMATCHING", span [ class "eyebrow-divider" ] [ text "/" ], text (String.toUpper model.mode) ]
                , h1 [] [ text (modeName model.mode) ]
                , p [] [ text (modeDescription model.mode) ]
                ]
            , div [ class "session-badge" ] [ span [ class "status-dot" ] [], text "PRACTICE SESSION", strong [] [ text (pad2 (List.length model.history + 1)) ] ]
            ]
        , div [ class "practice-toolbar" ]
            [ div [ class "toolbar-left" ]
                [ span [ class "mode-pill" ]
                    [ text
                        (if model.a.source == "pcm" && model.b.source == "pcm" then
                            "REAL TRACKS"

                         else if model.a.source /= model.b.source then
                            "MIXED SOURCES"

                         else if model.mode == "foundation" then
                            "KICK-ONLY EXERCISE"

                         else
                            "GENERATED LOOPS"
                        )
                    ]
                , span [ class "toolbar-description" ]
                    [ text
                        (if model.mode == "pro" then
                            "Local playback · nothing uploaded"

                         else
                            "32 beats · endless possibilities"
                        )
                    ]
                ]
            , div [ class "toolbar-actions" ]
                [ button [ class "session-focus-button", onClick (FocusSession True), attribute "aria-label" "Focus session" ] [ text "Focus session ⛶" ]
                , toggle "Hide BPM" model.hideBpm HideBpm
                , if not (String.isEmpty model.drill) then
                    button [ class "small-button", onClick NewChallenge, title "Start a new drill with both decks reset" ] [ text "New challenge" ]

                  else
                    text ""
                ]
            ]
        , if model.mode == "foundation" then
            foundationGuide

          else
            text ""
        , div [ class "deck-rack" ]
            [ div [ class "rack-title" ] [ span [] [ text "BIT.CHEER / DUAL DECK SYSTEM" ], span [ class "rack-grip" ] [ text "▥ ▥ ▥ ▥ ▥ ▥ ▥" ], span [] [ text "STEREO · 32-BIT FLOAT" ] ]
            , div [ class "decks" ] [ deckView model 0 model.a, deckView model 1 model.b ]
            , proTrackPickers model
            , globalModulesView model
            , div [ class "rack-footer" ] [ span [] [ text "● RUST DSP / WEBASSEMBLY" ], span [] [ text "OUTPUT RATE FOLLOWS YOUR AUDIO DEVICE" ], span [] [ text "NO SYNC. ALL YOU." ] ]
            ]
        , div [ class "under-decks" ]
            [ button [ class "play-both-button", onClick PlayBoth ]
                [ text
                    (if model.a.playing || model.b.playing then
                        "Ⅱ Pause both decks"

                     else
                        "▶ Play both decks"
                    )
                , small [] [ text "SPACE" ]
                ]
            , if model.mode == "foundation" then
                button [ class "builder-invitation", onClick (SetMode "builder") ] [ text "Ready for more? Build a layered loop →" ]

              else if model.mode /= "pro" && model.a.source == "generated" && model.b.source == "generated" then
                button [ class "add-element-button", onClick AddBothElements, disabled (List.length model.a.elements == 20 && List.length model.b.elements == 20) ] [ text "+ Add an element to both decks" ]

              else
                span [ class "muted" ] [ text "Drag the waveforms to seek. Scroll to zoom." ]
            ]
        , div [ class "practice-tip" ] [ span [] [ text "A LITTLE POINTER" ], text "Match the speed first. Then use nudge to bring the kicks into the same moment." ]
        ]


foundationGuide : Html Msg
foundationGuide =
    div [ class "foundation-guide", attribute "aria-label" "Foundation practice steps" ]
        [ div [ class "foundation-step" ] [ span [] [ text "01" ], div [] [ strong [] [ text "Listen" ], small [] [ text "Play both kick drums. Hear which one drifts ahead." ] ] ]
        , div [ class "foundation-step" ] [ span [] [ text "02" ], div [] [ strong [] [ text "Match tempo" ], small [] [ text "Adjust one pitch fader until the drift stops." ] ] ]
        , div [ class "foundation-step" ] [ span [] [ text "03" ], div [] [ strong [] [ text "Nudge & check" ], small [] [ text "Line up the kicks, then check your match." ] ] ]
        ]


deckModuleNames : List ( String, String )
deckModuleNames =
    [ ( "screen", "Screen" ), ( "pitch", "Pitch fader" ), ( "volume", "Volume" ), ( "jog", "Jog wheel" ), ( "waveform", "Waveform" ), ( "eq", "Equalizer" ), ( "vu", "VU meter" ), ( "loop", "Loop" ), ( "composer", "Composer" ), ( "picker", "Track picker" ) ]


globalModuleNames : List ( String, String )
globalModuleNames =
    [ ( "crossfader", "Crossfader" ), ( "master", "Master volume" ), ( "monitor", "Monitor" ), ( "outputs", "Audio outputs" ), ( "coach", "Coach" ), ( "tap", "Tap tempo" ), ( "discovery", "External track discovery" ) ]


defaultModuleLayout : String -> ModuleLayout
defaultModuleLayout mode =
    let
        ids =
            if mode == "pro" then
                [ "screen", "pitch", "volume", "picker" ]

            else if mode == "builder" || mode == "blind" then
                [ "screen", "pitch", "volume", "composer" ]

            else
                [ "screen", "pitch", "volume" ]

        modules names =
            List.map (\name -> { id = name, collapsed = False }) names
    in
    { a = modules ids, b = modules ids, global = modules [ "crossfader", "master", "coach" ] }


activeLayout : Model -> ModuleLayout
activeLayout model =
    Dict.get model.mode model.layouts |> Maybe.withDefault (defaultModuleLayout model.mode)


scopeModules : Int -> ModuleLayout -> List PlayerModule
scopeModules scope layout =
    if scope == 0 then
        layout.a

    else if scope == 1 then
        layout.b

    else
        layout.global


availableModules : Int -> Model -> List ( String, String )
availableModules scope model =
    if scope == -1 then
        globalModuleNames

    else
        deckModuleNames
            |> List.filter
                (\( name, _ ) ->
                    if name == "composer" then
                        model.mode == "builder" || model.mode == "blind"

                    else if name == "picker" then
                        model.mode == "pro"

                    else
                        True
                )


changeModules : Int -> (List PlayerModule -> List PlayerModule) -> Model -> ( Model, Cmd Msg )
changeModules scope change model =
    let
        layout =
            activeLayout model

        changed =
            if scope == 0 then
                { layout | a = change layout.a }

            else if scope == 1 then
                { layout | b = change layout.b }

            else
                { layout | global = change layout.global }

        next =
            { model | layouts = Dict.insert model.mode changed model.layouts }
    in
    ( next
    , Cmd.batch
        [ persistLayout next
        , if scope == -1 && List.any (\item -> item.id == "outputs" && not item.collapsed) changed.global && not (List.any (\item -> item.id == "outputs" && not item.collapsed) layout.global) then
            send "refreshOutputs" []

          else
            Cmd.none
        ]
    )


persistLayout : Model -> Cmd Msg
persistLayout model =
    let
        encodeModule item =
            E.object [ ( "id", E.string item.id ), ( "collapsed", E.bool item.collapsed ) ]

        encodeMode layout =
            E.object [ ( "decks", E.list (E.list encodeModule) [ layout.a, layout.b ] ), ( "global", E.list encodeModule layout.global ) ]
    in
    send "layout" [ ( "layout", E.object [ ( "modes", E.object (List.map (\( mode, layout ) -> ( mode, encodeMode layout )) (Dict.toList model.layouts)) ), ( "sensitivity", E.list E.float [ model.a.sensitivity, model.b.sensitivity ] ) ] ) ]


moduleLayoutDecoder : D.Decoder ModuleLayout
moduleLayoutDecoder =
    let
        itemDecoder =
            D.map2 PlayerModule (D.field "id" D.string) (D.oneOf [ D.field "collapsed" D.bool, D.succeed False ])

        clean allowed items =
            List.foldl
                (\item acc ->
                    if List.member item.id (List.map Tuple.first allowed) && not (List.any (\entry -> entry.id == item.id) acc) then
                        acc ++ [ item ]

                    else
                        acc
                )
                []
                items
    in
    D.map2 (\decks globals -> { a = List.head decks |> Maybe.withDefault [] |> clean deckModuleNames, b = List.head (List.drop 1 decks) |> Maybe.withDefault [] |> clean deckModuleNames, global = clean globalModuleNames globals })
        (D.field "decks" (D.list (D.list itemDecoder)))
        (D.field "global" (D.list itemDecoder))


deckLetter : Int -> String
deckLetter number =
    if number == 0 then
        "A"

    else
        "B"


moduleLabel : String -> String
moduleLabel moduleId =
    List.filter (\( name, _ ) -> name == moduleId) (deckModuleNames ++ globalModuleNames) |> List.head |> Maybe.map Tuple.second |> Maybe.withDefault moduleId


playerModule : Int -> PlayerModule -> Html Msg -> Html Msg
playerModule scope item content =
    let
        labelText =
            moduleLabel item.id

        destination =
            if scope == -1 then
                "session"

            else
                "deck " ++ deckLetter scope

        scopeName =
            if scope == -1 then
                "session"

            else
                "deck-" ++ String.toLower (deckLetter scope)
    in
    section [ classList [ ( "player-module", True ), ( "module-" ++ item.id, True ), ( "module-output", item.id == "outputs" ), ( "is-collapsed", item.collapsed ) ], attribute "data-module" item.id, attribute "data-scope" scopeName, attribute "aria-label" (labelText ++ " module " ++ destination) ]
        [ div [ class "module-titlebar" ]
            [ strong []
                [ text
                    (if item.id == "picker" && scope >= 0 then
                        "Deck " ++ deckLetter scope ++ " — " ++ labelText

                     else
                        labelText
                    )
                ]
            , div [ class "module-window-actions" ]
                [ button
                    [ class "module-collapse"
                    , onClick (ToggleModule scope item.id)
                    , attribute "aria-expanded"
                        (if item.collapsed then
                            "false"

                         else
                            "true"
                        )
                    , attribute "aria-label"
                        ((if item.collapsed then
                            "Open "

                          else
                            "Hide "
                         )
                            ++ labelText
                            ++ " "
                            ++ destination
                        )
                    ]
                    [ text
                        (if item.collapsed then
                            "Open"

                         else
                            "Hide"
                        )
                    ]
                , button [ class "module-remove", onClick (RemoveModule scope item.id), attribute "aria-label" ("Remove " ++ labelText ++ " " ++ destination), title "Remove this module; restore it from Add module" ] [ text "×" ]
                ]
            ]
        , if item.collapsed then
            text ""

          else
            div [ class "module-body" ] [ content ]
        ]


addModuleMenu : Model -> Int -> Html Msg
addModuleMenu model scope =
    let
        modules =
            scopeModules scope (activeLayout model)

        available =
            availableModules scope model |> List.filter (\( name, _ ) -> not (List.any (\item -> item.id == name) modules))

        labelText =
            if scope == -1 then
                "Add session module"

            else
                "Add module to deck " ++ deckLetter scope
    in
    div [ class "add-module-menu" ]
        [ Keyed.node "span"
            [ style "display" "contents" ]
            [ ( String.join "|" (List.map .id modules)
              , select [ onInput (AddModule scope), disabled (List.isEmpty available), attribute "aria-label" labelText ]
                    (option [ attribute "value" "", selected True, disabled True ]
                        [ text
                            (if List.isEmpty available then
                                "All modules added"

                             else
                                "+ Add module…"
                            )
                        ]
                        :: List.map (\( name, labelText_ ) -> option [ value name ] [ text labelText_ ]) available
                    )
              )
            ]
        , small [] [ text "Hide to fold. × to remove. Audio keeps playing." ]
        ]


deckView : Model -> Int -> Deck -> Html Msg
deckView model number deck =
    let
        letter =
            deckLetter number

        modules =
            scopeModules number (activeLayout model) |> List.filter (\item -> item.id /= "picker")

        hasPitch =
            List.any (\item -> item.id == "pitch" && not item.collapsed) modules
    in
    section [ class ("deck deck-" ++ String.toLower letter), attribute "data-deck" (String.fromInt number), attribute "aria-label" ("Deck " ++ letter) ]
        [ div [ class "deck-heading" ]
            [ span [ class "deck-label" ]
                [ span [ class "deck-letter" ] [ text letter ]
                , strong [] [ text ("DECK " ++ letter) ]
                , span [ class "deck-role" ]
                    [ text
                        (if number == 0 then
                            "REFERENCE"

                         else
                            "MATCH THIS"
                        )
                    ]
                ]
            , span [ classList [ ( "deck-state", True ), ( "playing", deck.playing ) ] ]
                [ span [ class "status-dot" ] []
                , text
                    (if deck.playing then
                        "PLAYING"

                     else
                        "READY"
                    )
                ]
            ]
        , div [ classList [ ( "deck-module-grid", True ), ( "has-pitch", hasPitch ) ] ]
            (List.map (\item -> playerModule number item (deckModuleContent model number deck item.id)) (List.filter (\item -> item.id == "screen") modules)
                ++ [ transportView model number deck ]
                ++ List.map (\item -> playerModule number item (deckModuleContent model number deck item.id)) (List.filter (\item -> item.id /= "screen") modules)
            )
        , if List.isEmpty modules then
            p [ class "empty-deck" ] [ text "Add a module to build this deck." ]

          else
            text ""
        , addModuleMenu model number
        ]


deckModuleContent : Model -> Int -> Deck -> String -> Html Msg
deckModuleContent model number deck moduleId =
    case moduleId of
        "screen" ->
            screenView model number deck

        "pitch" ->
            pitchView number deck

        "volume" ->
            volumeView number deck

        "jog" ->
            jogView number deck

        "waveform" ->
            waveformView number deck

        "eq" ->
            equalizerView number deck

        "vu" ->
            vuMeter deck.peak

        "loop" ->
            div [ class "loop-module" ] [ toggle "Loop" deck.loop (Loop number), small [] [ text "Repeat at the end of this track." ] ]

        "composer" ->
            composerView number deck

        "picker" ->
            trackPickerView model number deck

        _ ->
            text ""


screenView : Model -> Int -> Deck -> Html Msg
screenView model number deck =
    let
        letter =
            deckLetter number

        effective =
            deck.bpm * (1 + deck.pitch / 100)
    in
    div [ class "deck-screen" ]
        [ div [ class "headspace-transport" ]
            [ button [ onClick (Cue number), attribute "aria-label" ("Previous cue deck " ++ letter), title "Return to the saved cue point" ] [ text "◀" ]
            , button [ onClick (Play number), attribute "aria-label" ("Headspace play/pause deck " ++ letter), title "Play or pause this deck" ]
                [ text
                    (if deck.playing then
                        "Ⅱ"

                     else
                        "▶"
                    )
                ]
            , button [ onClick (Cue number), attribute "aria-label" ("Stop to cue deck " ++ letter), title "Stop and return to cue" ] [ text "■" ]
            , button [ onClick (Nudge number 0.04), attribute "aria-label" ("Headspace nudge forward deck " ++ letter), title "Nudge forward" ] [ text "▶│" ]
            , button [ onClick (FocusSession True), attribute "aria-label" ("Headspace focus session from deck " ++ letter), title "Focus on both decks' pitch, volume, and playback" ] [ text "☼" ]
            ]
        , div [ class "track-title" ]
            [ span [] [ text "♫" ]
            , strong [] [ text deck.name ]
            , span [ class "loop-badge" ]
                [ text
                    (if model.mode == "foundation" then
                        "KICK-ONLY"

                     else if deck.source == "pcm" then
                        "TRACK"

                     else
                        "LAYERED LOOP"
                    )
                ]
            ]
        , div [ class "lcd-row" ]
            [ div [ class "lcd bpm-display" ]
                [ span
                    [ class "lcd-number"
                    , attribute "data-testid" ("bpm-" ++ String.toLower letter)
                    , attribute "role" "img"
                    , attribute "aria-label"
                        (if model.hideBpm then
                            "BPM hidden"

                         else
                            fixed 2 effective ++ " BPM"
                        )
                    ]
                    (lcdDigits
                        (if model.hideBpm then
                            "---.--"

                         else
                            fixed 2 effective
                        )
                    )
                , small [] [ text "BPM" ]
                ]
            , div [ class "time-display" ]
                [ span [ class "lcd-time" ] [ text (timeDisplay deck.position) ]
                , small []
                    [ text
                        (if model.hideBpm then
                            "LISTEN. DON'T LOOK."

                         else
                            "SOURCE " ++ fixed 1 deck.bpm ++ " BPM"
                        )
                    ]
                ]
            ]
        ]


waveformView : Int -> Deck -> Html Msg
waveformView number deck =
    let
        letter =
            deckLetter number
    in
    div [ class "waveform-module" ]
        [ div [ class "waveform-wrap" ]
            [ canvas [ id ("waveform-" ++ String.toLower letter), class "waveform", attribute "width" "600", attribute "height" "88", attribute "aria-label" ("Deck " ++ letter ++ " waveform: drag to seek, scroll to zoom") ] []
            , span [ class "waveform-label" ]
                [ text
                    (if deck.source == "pcm" then
                        "SEEK / SCROLL TO ZOOM"

                     else
                        "32-BEAT LOOP"
                    )
                ]
            ]
        , div [ class "beat-row" ]
            [ div [ class "beat-indicators", attribute "aria-hidden" "true" ] (List.map (\i -> span [ classList [ ( "beat-dot", True ), ( "on", deck.playing && modBy 4 (floor deck.beat) == i ) ] ] [ text (String.fromInt (i + 1)) ]) (List.range 0 3))
            , span [] [ text "4 / 4" ]
            , div [ class "zoom-controls" ] [ button [ class "small-button", onClick (Zoom number 0.5), attribute "aria-label" ("Zoom out deck " ++ letter ++ " waveform") ] [ text "−" ], span [] [ text "ZOOM" ], button [ class "small-button", onClick (Zoom number 2), attribute "aria-label" ("Zoom in deck " ++ letter ++ " waveform") ] [ text "+" ] ]
            ]
        ]


playButton : Int -> Deck -> Html Msg
playButton number deck =
    button
        [ classList [ ( "transport-play", True ), ( "engaged", deck.playing ) ]
        , onClick (Play number)
        , attribute "aria-label"
            ((if deck.playing then
                "Pause"

              else
                "Play"
             )
                ++ " deck "
                ++ deckLetter number
            )
        , title
            (if deck.playing then
                "Pause"

             else
                "Play"
            )
        ]
        [ text
            (if deck.playing then
                "Ⅱ"

             else
                "▶"
            )
        ]


transportView : Model -> Int -> Deck -> Html Msg
transportView model number deck =
    let
        letter =
            deckLetter number
    in
    div [ class "deck-transport", attribute "role" "group", attribute "aria-label" ("Deck " ++ letter ++ " transport") ]
        [ div [ class "transport" ]
            [ playButton number deck
            , button [ class "transport-cue", onClick (Cue number), title "Return to the saved cue point" ] [ text "CUE" ]
            , button [ class "set-cue", onClick (SetCue number), attribute "aria-label" ("Set cue deck " ++ letter), title "Save the current position as cue" ] [ text "SET" ]
            , div [ class "nudge-controls" ] [ button [ onClick (Nudge number -0.04), attribute "aria-label" ("Nudge deck " ++ letter ++ " backward") ] [ text "−" ], span [] [ text "NUDGE" ], button [ onClick (Nudge number 0.04), attribute "aria-label" ("Nudge deck " ++ letter ++ " forward") ] [ text "+" ] ]
            ]
        , div [ class "deck-actions" ]
            [ button [ class "deck-action tempo-action", onClick (RandomizeTempo number), disabled (model.drill == "phase" || model.drill == "phrase"), attribute "aria-label" ("Randomize tempo deck " ++ letter) ] [ text "Randomize tempo" ]
            , if model.mode /= "pro" then
                button [ class "deck-action track-action", onClick (ChangeTrack number), attribute "aria-label" ("Change track deck " ++ letter) ] [ text "Change track" ]

              else
                text ""
            ]
        , small [ class "deck-action-hint" ]
            [ text
                (if model.drill == "phase" || model.drill == "phrase" then
                    "Tempo is fixed for this drill. New challenge resets both decks."

                 else if model.mode == "foundation" then
                    "Tempo changes speed. Track changes the kick voice."

                 else
                    "Change this deck independently."
                )
            ]
        ]


pitchView : Int -> Deck -> Html Msg
pitchView number deck =
    let
        letter =
            deckLetter number

        position =
            (deck.range - deck.pitch) / (2 * deck.range) * 100 |> clamp 0 100
    in
    div [ class "pitch-section", attribute "data-deck" (String.fromInt number) ]
        [ div [ class "control-label" ] [ text "PITCH" ]
        , div [ class "pitch-track", attribute "style" ("--pitch-position: " ++ String.fromFloat position ++ "%;") ]
            [ div [ class "pitch-rail" ] []
            , div [ class "pitch-ticks" ] [ span [] [ text ("+" ++ String.fromFloat deck.range) ], span [] [ text "0" ], span [] [ text ("−" ++ String.fromFloat deck.range) ] ]
            , div [ class "pitch-marker-layer", attribute "aria-hidden" "true" ] [ div [ class "pitch-handle" ] [ span [ class "pitch-handle-line" ] [] ] ]
            , input [ class "vertical-fader", type_ "range", A.min (String.fromFloat -deck.range), A.max (String.fromFloat deck.range), step "any", value (String.fromFloat deck.pitch), onInput (Pitch number), attribute "aria-label" ("Deck " ++ letter ++ " pitch"), attribute "orient" "vertical", attribute "data-deck" (String.fromInt number), attribute "data-pitch-sensitivity" (String.fromFloat deck.sensitivity) ] []
            ]
        , div [ class "pitch-value" ] [ text (signed 2 deck.pitch ++ "%") ]
        , div [ class "pitch-fine" ] [ button [ onClick (PitchStep number -0.01), attribute "aria-label" ("Fine decrease deck " ++ letter ++ " pitch") ] [ text "−" ], button [ onClick (Pitch number "0"), title "Reset pitch" ] [ text "0" ], button [ onClick (PitchStep number 0.01), attribute "aria-label" ("Fine increase deck " ++ letter ++ " pitch") ] [ text "+" ] ]
        , select [ class "pitch-range", onInput (Range number), attribute "aria-label" ("Deck " ++ letter ++ " pitch range") ] (List.map (\r -> option [ value (String.fromInt r), selected (toFloat r == deck.range) ] [ text ("±" ++ String.fromInt r ++ "%") ]) [ 2, 4, 8, 16, 32, 50 ])
        , label [ class "pitch-sensitivity" ] [ span [] [ text "Wheel / keys" ], select [ onInput (Sensitivity number), attribute "aria-label" ("Deck " ++ letter ++ " pitch sensitivity") ] (List.map (\( val, name ) -> option [ value (String.fromFloat val), selected (val == deck.sensitivity) ] [ text name ]) [ ( 0.01, "Fine" ), ( 0.05, "Normal" ), ( 0.25, "Coarse" ) ]) ]
        , small [ class "pitch-wheel-hint" ] [ text "Wheel or keys · Shift for fine" ]
        ]


volumeView : Int -> Deck -> Html Msg
volumeView number deck =
    div [ class "deck-volume-row" ] [ label [] [ text ("DECK " ++ deckLetter number ++ " VOLUME"), input [ type_ "range", A.min "0", A.max "1", step "0.01", value (String.fromFloat deck.volume), onInput (DeckValue number "volume"), attribute "aria-label" ("Deck " ++ deckLetter number ++ " volume") ] [] ], strong [] [ text (fixed 0 (deck.volume * 100) ++ "%") ] ]


jogView : Int -> Deck -> Html Msg
jogView number deck =
    let
        letter =
            deckLetter number
    in
    div [ class "jog-row" ]
        [ div [ id ("jog-" ++ String.toLower letter), class "jog-wheel", attribute "tabindex" "0", attribute "role" "slider", attribute "aria-label" ("Deck " ++ letter ++ " jog wheel"), attribute "aria-valuemin" "0", attribute "aria-valuemax" (String.fromFloat deck.duration), attribute "aria-valuenow" (String.fromFloat deck.position), attribute "data-deck" (String.fromInt number) ] [ div [ class "jog-grooves" ] [], div [ class "jog-label" ] [ strong [] [ text letter ], small [] [ text "BIT.CHEER" ] ], span [ class "jog-marker" ] [] ]
        , div [ class "jog-description" ] [ strong [] [ text "FEEL THE GROOVE" ], small [] [ text "Scroll to nudge" ], small [] [ text "Drag to scrub" ] ]
        ]


equalizerView : Int -> Deck -> Html Msg
equalizerView number deck =
    div [ class "eq-controls" ] (List.map (\( param, val ) -> label [ class "eq-control" ] [ span [] [ text (String.toUpper param) ], input [ type_ "range", A.min "-24", A.max "12", step "0.5", value (String.fromFloat val), onInput (DeckValue number param), attribute "aria-label" ("Deck " ++ deckLetter number ++ " " ++ param ++ " EQ") ] [], small [] [ text (signed 1 val ++ " dB") ] ]) [ ( "low", deck.low ), ( "mid", deck.mid ), ( "high", deck.high ) ])


composerView : Int -> Deck -> Html Msg
composerView number deck =
    let
        letter =
            deckLetter number
    in
    div [ class "element-panel" ]
        [ div [ class "control-label" ] [ span [] [ text "COMPOSER / 20-VOICE BANK" ], small [] [ text (String.fromInt (List.length deck.elements) ++ " / 20 ACTIVE") ] ]
        , div [ class "composer-actions" ]
            [ confirmedSelect (mask deck.elements)
                [ class "instrument-selector", onInput (AddInstrument number), disabled (List.length deck.elements == 20), attribute "aria-label" ("Add instrument to deck " ++ letter) ]
                (option [ attribute "value" "", selected True, disabled True ] [ text "+ Add instrument…" ] :: (List.indexedMap Tuple.pair voiceNames |> List.filter (\( index, _ ) -> not (List.member index deck.elements)) |> List.map (\( index, name ) -> option [ value (String.fromInt index) ] [ text name ])))
            , button [ class "deck-add-element", onClick (AddElement number), disabled (List.length deck.elements == 20), attribute "aria-label" ("Add an element to deck " ++ letter) ] [ text "+ Add next" ]
            , button [ class "chaos-button", onClick (Chaos number), attribute "aria-label" ("Chaos deck " ++ letter), title "Create a dense arrangement on this deck only" ] [ text "CHAOS!" ]
            ]
        , div [ class "elements composer-rack" ] (List.indexedMap Tuple.pair voiceNames |> List.filter (\( index, _ ) -> List.member index deck.elements) |> List.map (\( index, name ) -> voiceView number deck index name))
        , if List.isEmpty deck.elements then
            p [ class "composer-empty" ] [ text "Add an instrument to start your rhythm." ]

          else
            small [ class "composer-help" ] [ text "16 steps = one bar. Click to edit; Generate pattern restores AUTO." ]
        ]


playableTracks : Model -> Deck -> List Track
playableTracks model deck =
    List.filter (\track -> deck.genre == "All genres" || track.genre == deck.genre) model.tracks


selectedPlayable : Model -> Deck -> Maybe Track
selectedPlayable model deck =
    let
        tracks =
            playableTracks model deck
    in
    case List.head (List.filter (\track -> track.id == deck.selectedTrack) tracks) of
        Just track ->
            Just track

        Nothing ->
            List.head tracks


trackPickerView : Model -> Int -> Deck -> Html Msg
trackPickerView model number deck =
    let
        letter =
            deckLetter number

        genres =
            List.foldl
                (\track acc ->
                    if List.member track.genre acc then
                        acc

                    else
                        acc ++ [ track.genre ]
                )
                [ "All genres" ]
                model.tracks

        tracks =
            playableTracks model deck

        chosen =
            selectedPlayable model deck |> Maybe.map .id |> Maybe.withDefault ""
    in
    div [ class "track-picker" ]
        [ label [ class "track-picker-genre" ] [ span [] [ text "GENRE" ], select [ onInput (DeckGenre number), attribute "aria-label" ("Deck " ++ letter ++ " genre") ] (List.map (\genre -> option [ value genre, selected (genre == deck.genre) ] [ text genre ]) genres) ]
        , small [ class "library-count", attribute "aria-label" ("Deck " ++ letter ++ " library size") ]
            [ text
                (if List.isEmpty model.tracks then
                    "Loading playable library…"

                 else if deck.genre == "All genres" then
                    String.fromInt (List.length model.tracks) ++ " playable tracks · " ++ String.fromInt (List.length genres - 1) ++ " genres"

                 else
                    String.fromInt (List.length tracks)
                        ++ (if List.length tracks == 1 then
                                " track shown · "

                            else
                                " tracks shown · "
                           )
                        ++ String.fromInt (List.length model.tracks)
                        ++ " in library"
                )
            ]
        , label [ class "track-picker-selection" ]
            [ span [] [ text "PLAYABLE TRACK" ]
            , select [ onInput (SelectTrack number), disabled (List.isEmpty tracks), attribute "aria-label" ("Deck " ++ letter ++ " track") ]
                (if List.isEmpty tracks then
                    [ option [] [ text "Import a track to get started" ] ]

                 else
                    List.map (\track -> option [ value track.id, selected (track.id == chosen) ] [ text track.name ]) tracks
                )
            ]
        , div [ class "track-picker-actions" ]
            [ button [ class "primary-button load-track-button", onClick (LoadSelectedTrack number), disabled (List.isEmpty tracks), attribute "aria-label" ("Load selected track deck " ++ letter) ] [ text "Load" ]
            , button [ class "small-button", onClick (PreviousTrack number), disabled (List.isEmpty tracks), attribute "aria-label" ("Previous track deck " ++ letter) ] [ text "◀ Previous" ]
            , button [ class "small-button", onClick (NextTrack number), disabled (List.isEmpty tracks), attribute "aria-label" ("Next track deck " ++ letter) ] [ text "Next ▶" ]
            , button [ class "small-button", onClick (ChangeTrack number), disabled (List.isEmpty tracks), attribute "aria-label" ("Change track deck " ++ letter) ] [ text "Change track" ]
            , button [ class "small-button", onClick (ImportTrack number), attribute "aria-label" ("Import track into deck " ++ letter) ] [ text "↥ Import" ]
            ]
        , div [ class "picker-current" ] [ strong [] [ text "LOADED" ], span [] [ text deck.name ] ]
        , small [] [ text "These tracks play inside Bit Cheer. Imports stay on this device for this session." ]
        , div [ class "source-settings" ]
            [ if model.hideBpm then
                text ""

              else
                label [ class "source-bpm" ] [ span [] [ text "SOURCE BPM" ], input [ type_ "number", A.min "40", A.max "300", step "0.01", value (fixed 2 deck.bpm), on "change" (D.map (SourceBpm number) targetValue), attribute "aria-label" ("Deck " ++ letter ++ " source BPM") ] [] ]
            , button [ class "small-button", onClick (SetGrid number), attribute "aria-label" ("Set beat grid deck " ++ letter), title "Mark the current position as beat one" ] [ text "SET GRID" ]
            ]
        ]


proTrackPickers : Model -> Html Msg
proTrackPickers model =
    if model.mode == "pro" then
        div [ class "pro-track-pickers", attribute "aria-label" "Pro track selection" ]
            (List.concatMap
                (\number ->
                    scopeModules number (activeLayout model)
                        |> List.filter (\item -> item.id == "picker")
                        |> List.map (\item -> playerModule number item (trackPickerView model number (getDeck number model)))
                )
                [ 0, 1 ]
            )

    else
        text ""


globalModulesView : Model -> Html Msg
globalModulesView model =
    div [ class "session-modules" ]
        [ div [ class "global-module-grid" ] (List.map (\item -> playerModule -1 item (globalModuleContent model item.id)) (activeLayout model).global)
        , addModuleMenu model -1
        ]


globalModuleContent : Model -> String -> Html Msg
globalModuleContent model moduleId =
    case moduleId of
        "crossfader" ->
            crossfaderView model

        "master" ->
            masterView model

        "monitor" ->
            monitorView model

        "outputs" ->
            routingView model

        "coach" ->
            coachView model

        "tap" ->
            tapView model

        "discovery" ->
            discoveryView model

        _ ->
            text ""


crossfaderView : Model -> Html Msg
crossfaderView model =
    div [ class "crossfader" ]
        [ div [ class "crossfader-labels" ]
            [ strong [] [ text "A" ]
            , span []
                [ text
                    (if model.routing.mode == "mix" then
                        "CROSSFADER"

                     else
                        "EXTERNAL MIX"
                    )
                ]
            , strong [] [ text "B" ]
            ]
        , input [ type_ "range", A.min "0", A.max "1", step "0.01", value (String.fromFloat model.crossfade), onInput (Mixer "crossfade"), attribute "aria-label" "Crossfader", disabled (model.routing.mode /= "mix") ] []
        , div [ class "fader-scale" ] [ span [] [ text "╵ ╵ ╵ ╵ ╵" ], span [] [ text "│" ], span [] [ text "╵ ╵ ╵ ╵ ╵" ] ]
        ]


masterView : Model -> Html Msg
masterView model =
    label [ class "master-volume" ] [ span [ class "control-label" ] [ text "MASTER", strong [] [ text (fixed 0 (model.master * 100) ++ "%") ] ], input [ type_ "range", A.min "0", A.max "1", step "0.01", value (String.fromFloat model.master), onInput (Mixer "master"), attribute "aria-label" "Master volume" ] [] ]


monitorView : Model -> Html Msg
monitorView model =
    div [ class "mixer-monitor" ]
        [ toggleDisabled (model.routing.mode /= "mix") "Split cue" model.splitCue SplitCue
        , small []
            [ text
                (if model.routing.mode == "mix" then
                    "A → left / B → right"

                 else
                    "External output routing active"
                )
            ]
        ]


discoveryView : Model -> Html Msg
discoveryView model =
    let
        genres =
            List.foldl
                (\track acc ->
                    if List.member track.genre acc then
                        acc

                    else
                        acc ++ [ track.genre ]
                )
                [ "All genres" ]
                model.referenceTracks
    in
    div [ class "external-discovery" ]
        [ p [] [ text "External artist links from the Beatmatch PRO catalog. These links do not stream inside Bit Cheer; obtain a track from its artist, then import it into a deck." ]
        , select [ onInput Genre, attribute "aria-label" "External discovery genre" ] (List.map (\genre -> option [ value genre, selected (genre == model.genre) ] [ text genre ]) genres)
        , referenceLibraryView model
        ]


lcdDigits : String -> List (Html Msg)
lcdDigits number =
    String.toList number
        |> List.map
            (\character ->
                let
                    digit =
                        String.fromChar character

                    digitClass =
                        if character == '.' then
                            "lcd-dot"

                        else if character == '-' || character == '−' then
                            "lcd-dash"

                        else
                            "lcd-digit"
                in
                span [ class digitClass, attribute "data-digit" digit, attribute "aria-hidden" "true" ] [ text digit ]
            )


voiceView : Int -> Deck -> Int -> String -> Html Msg
voiceView deckNumber deck voiceIndex name =
    let
        voice =
            getVoice voiceIndex deck

        letter =
            if deckNumber == 0 then
                "A"

            else
                "B"

        bits =
            if voice.pattern >= 0 then
                voice.pattern

            else
                Basics.max 0 voice.preview

        automatic =
            voice.pattern < 0

        panLabel =
            if abs voice.pan < 0.01 then
                "C"

            else
                (if voice.pan < 0 then
                    "L "

                 else
                    "R "
                )
                    ++ fixed 0 (abs voice.pan * 100)
    in
    div [ classList [ ( "voice-row", True ), ( "soloed", deck.solo == voiceIndex ), ( "muted-by-solo", deck.solo /= -1 && deck.solo /= voiceIndex ) ], attribute "data-voice" (String.fromInt voiceIndex) ]
        [ div [ class "voice-strip" ]
            [ button [ class "element enabled voice-name", onClick (Element deckNumber voiceIndex), attribute "aria-pressed" "true", attribute "aria-label" ("Deck " ++ letter ++ " " ++ name), title ("Remove " ++ name ++ " from this deck") ] [ span [ class "element-light" ] [], text name, span [ class "voice-remove" ] [ text " ×" ] ]
            , label [ class "voice-gain" ]
                [ span [] [ text ("LEVEL " ++ fixed 0 (voice.gain * 100) ++ "%") ]
                , input [ type_ "range", A.min "0", A.max "1.5", step "0.01", value (String.fromFloat voice.gain), onInput (VoiceValue deckNumber voiceIndex "gain"), attribute "aria-label" ("Deck " ++ letter ++ " " ++ name ++ " level") ] []
                ]
            , label [ class "voice-pan" ]
                [ span [] [ text ("PAN " ++ panLabel) ]
                , input [ type_ "range", A.min "-1", A.max "1", step "0.01", value (String.fromFloat voice.pan), onInput (VoiceValue deckNumber voiceIndex "pan"), attribute "aria-label" ("Deck " ++ letter ++ " " ++ name ++ " pan") ] []
                ]
            , button
                [ classList [ ( "voice-solo", True ), ( "active", deck.solo == voiceIndex ) ]
                , onClick (SoloVoice deckNumber voiceIndex)
                , attribute "aria-label" ("Solo " ++ name ++ " deck " ++ letter)
                , attribute "aria-pressed"
                    (if deck.solo == voiceIndex then
                        "true"

                     else
                        "false"
                    )
                ]
                [ text "SOLO" ]
            ]
        , div [ class "voice-pattern" ]
            [ span [ class "pattern-mode" ]
                [ text
                    (if automatic then
                        "AUTO"

                     else
                        "MANUAL"
                    )
                ]
            , div [ class "step-grid", attribute "aria-label" ("Deck " ++ letter ++ " " ++ name ++ " sixteen-step pattern") ]
                (List.range 0 15
                    |> List.map
                        (\stepIndex ->
                            let
                                active =
                                    Bitwise.and bits (Bitwise.shiftLeftBy stepIndex 1) /= 0
                            in
                            button
                                [ classList [ ( "step-button", True ), ( "on", active ), ( "beat-start", modBy 4 stepIndex == 0 ), ( "current", deck.playing && modBy 16 (floor (deck.beat * 4)) == stepIndex ) ]
                                , onClick (VoiceStep deckNumber voiceIndex stepIndex)
                                , attribute "aria-label" ("Deck " ++ letter ++ " " ++ name ++ " step " ++ String.fromInt (stepIndex + 1))
                                , attribute "aria-pressed"
                                    (if active then
                                        "true"

                                     else
                                        "false"
                                    )
                                ]
                                [ text (String.fromInt (stepIndex + 1)) ]
                        )
                )
            , button [ class "generate-pattern", onClick (ResetVoicePattern deckNumber voiceIndex), attribute "aria-label" ("Generate pattern for " ++ name ++ " deck " ++ letter), title "Restore this voice's learned automatic pattern" ] [ text "Generate pattern" ]
            ]
        ]


vuMeter : Float -> Html Msg
vuMeter peak =
    div [ class "vu-section", attribute "aria-label" ("Peak level " ++ fixed 0 (peak * 100) ++ "%") ]
        [ span [] [ text "LEVEL" ]
        , div [ class "vu-meter" ] (List.map (\n -> span [ classList [ ( "vu-segment", True ), ( "lit", peak > toFloat n / 14 ), ( "warm", n > 9 ), ( "hot", n > 12 ) ] ] []) (List.range 0 13))
        ]


mixerView : Model -> Html Msg
mixerView model =
    div [ class "mixer" ]
        [ div [ class "mixer-monitor" ]
            [ span [ class "control-label" ] [ text "MONITOR" ]
            , toggleDisabled (model.routing.mode /= "mix") "Split cue" model.splitCue SplitCue
            , small []
                [ text
                    (if model.routing.mode == "mix" then
                        "A → left / B → right"

                     else
                        "External output routing active"
                    )
                ]
            ]
        , div [ class "crossfader" ]
            [ div [ class "crossfader-labels" ]
                [ strong [] [ text "A" ]
                , span []
                    [ text
                        (if model.routing.mode == "mix" then
                            "CROSSFADER"

                         else
                            "EXTERNAL MIX"
                        )
                    ]
                , strong [] [ text "B" ]
                ]
            , input
                [ type_ "range"
                , A.min "0"
                , A.max "1"
                , step "0.01"
                , value (String.fromFloat model.crossfade)
                , onInput (Mixer "crossfade")
                , attribute "aria-label" "Crossfader"
                , disabled (model.routing.mode /= "mix")
                , title
                    (if model.routing.mode == "mix" then
                        "Blend the two decks"

                     else
                        "Separate output channels bypass the software crossfader"
                    )
                ]
                []
            , div [ class "fader-scale" ] [ span [] [ text "╵ ╵ ╵ ╵ ╵" ], span [] [ text "│" ], span [] [ text "╵ ╵ ╵ ╵ ╵" ] ]
            ]
        , label [ class "master-volume" ]
            [ span [ class "control-label" ] [ text "MASTER", strong [] [ text (fixed 0 (model.master * 100) ++ "%") ] ]
            , input [ type_ "range", A.min "0", A.max "1", step "0.01", value (String.fromFloat model.master), onInput (Mixer "master"), attribute "aria-label" "Master volume" ] []
            ]
        ]


routingView : Model -> Html Msg
routingView model =
    let
        routing =
            model.routing

        summary =
            if routing.mode == "mix" then
                "Stereo mix · master output"

            else
                "A → " ++ channelLabel routing.mode routing.a ++ " / B → " ++ channelLabel routing.mode routing.b
    in
    section [ class "output-routing expanded", attribute "aria-label" "Audio output routing" ]
        [ div [ class "routing-heading" ] [ small [] [ text summary ] ]
        , div [ id "routing-panel", class "routing-panel" ]
            [ div [ class "routing-status" ]
                [ span [ class "status-dot" ] []
                , strong []
                    [ text
                        (if routing.maxChannels > 0 then
                            String.fromInt routing.maxChannels ++ " channels exposed by browser"

                         else
                            "Detecting available output channels…"
                        )
                    ]
                , button [ class "small-button", onClick RefreshOutputs ] [ text "Refresh outputs" ]
                ]
            , div [ class "routing-controls" ]
                [ label [ class "routing-control" ]
                    [ span [] [ text "OUTPUT MODE" ]
                    , confirmedSelect model.routingRevision
                        [ value routing.mode, onInput RoutingMode, attribute "aria-label" "Output mode" ]
                        [ option [ value "mix", selected (routing.mode == "mix") ] [ text "Stereo mix" ]
                        , option [ value "mono", selected (routing.mode == "mono"), disabled (routing.maxChannels < 2) ] [ text "Separate mono channels" ]
                        , option [ value "stereo", selected (routing.mode == "stereo"), disabled (routing.maxChannels < 4) ] [ text "Separate stereo pairs" ]
                        ]
                    ]
                , if routing.mode /= "mix" then
                    div [ class "routing-decks" ]
                        [ routingDeckSelect model.routingRevision routing 0
                        , routingDeckSelect model.routingRevision routing 1
                        , button [ class "small-button", onClick SwapRouting, title "Swap both decks without overlapping channels" ] [ text "Swap A / B" ]
                        ]

                  else
                    p [ class "routing-mix-note" ] [ text "Both decks share the stereo master. Use the crossfader to blend them or split cue to monitor each side." ]
                ]
            , if routing.canChooseOutput || routing.canPickOutput then
                div [ class "output-device" ]
                    [ if routing.canChooseOutput then
                        label [ class "routing-control" ]
                            [ span [] [ text "OUTPUT DEVICE" ]
                            , confirmedSelect model.routingRevision
                                [ value routing.deviceId, onInput AudioOutput, attribute "aria-label" "Output device" ]
                                (List.map (\device -> option [ value device.id, selected (device.id == routing.deviceId) ] [ text device.label ])
                                    (if List.isEmpty routing.devices then
                                        [ { id = "default", label = "System default" } ]

                                     else
                                        routing.devices
                                    )
                                )
                            ]

                      else
                        text ""
                    , if routing.canPickOutput then
                        button [ class "small-button", onClick PickOutput ] [ text "Choose an output device…" ]

                      else
                        text ""
                    ]

              else
                p [ class "routing-device-note" ] [ text "This browser uses the system output device. Choose your audio interface in your operating system, then refresh outputs." ]
            , p [ class "routing-explanation" ]
                [ text
                    (if routing.mode == "mix" then
                        "Separate mono sends each deck to one physical channel. Separate stereo sends each deck to its own adjacent channel pair and requires at least four channels exposed by the browser."

                     else
                        "Separate outputs bypass the software crossfader and split cue so you can mix externally. Deck volume, EQ, and master volume still work."
                    )
                ]
            , if routing.maxChannels > 0 && routing.maxChannels < 4 then
                small [ class "routing-limitation" ] [ text "The browser exposes fewer than four channels. Select your multichannel interface in OS audio settings, then refresh. Stereo pairs need four exposed outputs." ]

              else
                text ""
            ]
        ]


channelLabel : String -> Int -> String
channelLabel routeMode start =
    if routeMode == "stereo" then
        "Channels " ++ String.fromInt (start + 1) ++ "–" ++ String.fromInt (start + 2)

    else
        "Channel " ++ String.fromInt (start + 1)


routingDeckSelect : Int -> OutputRouting -> Int -> Html Msg
routingDeckSelect revision routing deck =
    let
        letter =
            if deck == 0 then
                "A"

            else
                "B"

        current =
            if deck == 0 then
                routing.a

            else
                routing.b

        other =
            if deck == 0 then
                routing.b

            else
                routing.a

        width =
            if routing.mode == "stereo" then
                2

            else
                1

        starts =
            List.range 0 (routing.maxChannels - width)
                |> List.filter (\start -> start + width <= other || other + width <= start)
    in
    label [ class "routing-control" ]
        [ span [] [ text ("DECK " ++ letter ++ " OUTPUT") ]
        , confirmedSelect revision
            [ value (String.fromInt current), onInput (RoutingChannel deck), attribute "aria-label" ("Deck " ++ letter ++ " output") ]
            (List.map (\start -> option [ value (String.fromInt start), selected (start == current) ] [ text (channelLabel routing.mode start) ]) starts)
        ]


confirmedSelect : Int -> List (Html.Attribute Msg) -> List (Html Msg) -> Html Msg
confirmedSelect revision attributes children =
    -- A rejected browser selection can change the native element without changing
    -- Elm state. Recreate it on every engine confirmation, even when values match.
    Keyed.node "span"
        [ class "confirmed-select", style "display" "contents" ]
        [ ( String.fromInt revision, select attributes children ) ]


coachView : Model -> Html Msg
coachView model =
    section [ class "coach-panel" ]
        [ div [ class "panel-heading" ]
            [ span [ class "panel-icon" ] [ text "◎" ]
            , h2 [] [ text "Your ears. Your call." ]
            , span [ class "mini-badge" ]
                [ text
                    (if String.isEmpty model.drill then
                        "COACH"

                     else
                        String.toUpper model.drill ++ " DRILL"
                    )
                ]
            ]
        , case model.currentLesson |> Maybe.andThen (\number -> List.head (List.filter (\lesson -> lesson.number == number) lessons)) of
            Just lesson ->
                div [ class "lesson-instruction" ]
                    [ strong [] [ text ("LESSON " ++ String.fromInt lesson.number ++ " · " ++ lesson.name) ]
                    , p [] [ text lesson.instruction ]
                    ]

            Nothing ->
                text ""
        , case model.result of
            Just result ->
                div [ class "match-result", attribute "role" "status" ]
                    [ div [ class "score-circle" ] [ strong [] [ text (String.fromInt result.score) ], small [] [ text "/ 100" ] ]
                    , div []
                        [ strong []
                            [ text
                                (if result.score >= 85 then
                                    "That's the pocket."

                                 else
                                    "You're getting closer."
                                )
                            ]
                        , p [] [ text result.message ]
                        , small [] [ text ("Tempo: " ++ fixed 2 result.tempoError ++ " BPM apart · Phase: " ++ fixed 0 result.phaseError ++ " ms") ]
                        ]
                    ]

            Nothing ->
                div [ class "coach-copy" ]
                    [ h3 []
                        [ text
                            (if model.mode == "pro" then
                                "Find the downbeat."

                             else if model.currentLesson /= Nothing then
                                "Start with the kick."

                             else
                                "Listen for the double hit."
                            )
                        ]
                    , p []
                        [ text
                            (if String.isEmpty model.drill then
                                "Play both decks, then move deck B's pitch fader until the beats stop drifting. Nudge them into place."

                             else
                                drillInstruction model.drill
                            )
                        ]
                    ]
        , div [ class "coach-bottom" ]
            [ button [ class "primary-button", onClick Check ] [ text "Check my match", span [] [ text "↗" ] ]
            , span []
                [ text
                    (if List.isEmpty model.history then
                        "No pressure. Just practice."

                     else
                        String.fromInt (List.length model.history) ++ " checks · " ++ String.fromInt (average model.history) ++ " avg. score"
                    )
                ]
            ]
        ]


tapView : Model -> Html Msg
tapView model =
    section [ class "tap-panel" ]
        [ div [ class "panel-heading" ] [ span [ class "panel-icon" ] [ text "↟" ], h2 [] [ text "Feel the tempo" ], span [ class "mini-badge" ] [ text "TAP TEMPO" ] ]
        , div [ class "tap-content" ]
            [ button [ class "tap-button", onClick Tap, attribute "aria-label" "Tap tempo" ] [ strong [] [ text "TAP" ], small [] [ text "or press T" ] ]
            , div [ class "tap-readout" ]
                [ strong []
                    [ text
                        (if model.tapBpm > 0 then
                            fixed 1 model.tapBpm

                         else
                            "— — —"
                        )
                    ]
                , span [] [ text "BPM" ]
                , small []
                    [ text
                        (if model.taps == 0 then
                            "Tap along to the kick."

                         else
                            String.fromInt model.taps ++ " taps · keep the rhythm"
                        )
                    ]
                ]
            ]
        , div [ class "mic-row" ]
            [ button [ classList [ ( "text-button", True ), ( "active", model.micActive ) ], onClick Microphone ]
                [ text
                    (if model.micActive then
                        "● Stop microphone"

                     else
                        "♩ Listen with microphone"
                    )
                ]
            , small []
                [ text
                    (if model.micBpm > 0 then
                        fixed 1 model.micBpm ++ " BPM estimated"

                     else
                        "Optional · local analysis"
                    )
                ]
            ]
        ]


libraryView : Model -> Html Msg
libraryView model =
    let
        genres =
            List.foldl
                (\genre acc ->
                    if List.member genre acc then
                        acc

                    else
                        acc ++ [ genre ]
                )
                [ "All genres" ]
                (List.map .genre model.tracks ++ List.map .genre model.referenceTracks)

        tracks =
            List.filter (\track -> model.genre == "All genres" || track.genre == model.genre) model.tracks
    in
    section [ class "track-library" ]
        [ div [ class "section-heading" ]
            [ div [] [ div [ class "eyebrow" ] [ text "THE CRATE" ], h2 [] [ text "Pick your next groove." ] ]
            , select [ onInput Genre, attribute "aria-label" "Track genre" ] (List.map (\genre -> option [ selected (genre == model.genre), value genre ] [ text genre ]) genres)
            ]
        , if List.isEmpty tracks then
            div [ class "empty-library" ] [ p [] [ text "Your own music makes the best practice crate. Load a track into either deck to get started." ], button [ class "small-button", onClick (ImportTrack 0) ] [ text "↥ Import track A" ], button [ class "small-button", onClick (ImportTrack 1) ] [ text "↥ Import track B" ] ]

          else
            div [ class "track-list" ]
                (List.map
                    (\track ->
                        div [ class "track-row" ]
                            [ span [ class "track-art" ] [ text "♫" ]
                            , div [ class "track-meta" ] [ strong [] [ text track.name ], small [] [ text (track.artist ++ " · " ++ track.genre) ] ]
                            , span [ class "track-bpm" ] [ text (fixed 0 track.bpm ++ " BPM") ]
                            , button [ class "small-button", onClick (LoadTrack 0 track.id), attribute "aria-label" ("Load " ++ track.name ++ " into deck A") ] [ text "A +" ]
                            , button [ class "small-button", onClick (LoadTrack 1 track.id), attribute "aria-label" ("Load " ++ track.name ++ " into deck B") ] [ text "B +" ]
                            ]
                    )
                    tracks
                )
        , referenceLibraryView model
        , small [ class "library-note" ] [ text "Imported tracks stay on your device. BPM estimates can be half or double time. *File support depends on your browser. ", a [ href (model.basePath ++ "credits.html"), target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Music credits & licenses ↗" ] ]
        ]


referenceLibraryView : Model -> Html Msg
referenceLibraryView model =
    let
        matching =
            List.filter (\track -> model.genre == "All genres" || track.genre == model.genre) model.referenceTracks

        total =
            List.length matching
    in
    if total == 0 then
        text ""

    else
        div [ class "reference-crate" ]
            [ div [ class "section-heading" ] [ h3 [] [ text "From the Beatmatch PRO crate" ], span [ class "mini-badge" ] [ text (String.fromInt total ++ " TRACK LINKS") ] ]
            , p [] [ text "Discover the original library. Obtain tracks from the artist, then import them locally." ]
            , div [ class "reference-tracks" ]
                (List.map (\track -> a [ class "reference-track", href track.source, target "_blank", attribute "rel" "noopener noreferrer" ] [ strong [] [ text track.name ], small [] [ text track.genre ], span [] [ text "Get track ↗" ] ]) (List.take 8 (List.drop (model.referencePage * 8) matching)))
            , div [ class "crate-pagination" ]
                [ button [ class "small-button", onClick (ReferencePage (model.referencePage - 1)), disabled (model.referencePage == 0) ] [ text "← Previous" ]
                , span [] [ text ("Page " ++ String.fromInt (model.referencePage + 1) ++ " / " ++ String.fromInt (ceiling (toFloat total / 8))) ]
                , button [ class "small-button", onClick (ReferencePage (model.referencePage + 1)), disabled ((model.referencePage + 1) * 8 >= total) ] [ text "Next →" ]
                ]
            ]


type alias Lesson =
    { number : Int, name : String, label : String, description : String, instruction : String, mode : String, elements : List Int }


lessons : List Lesson
lessons =
    [ { number = 1, name = "Meet the beat", label = "FOUNDATION", description = "Hear the pulse. Start with two clean kick drums.", instruction = "Lesson 1: Play both decks. Match the BPM with pitch, then nudge the kicks together. Score 85+ to complete.", mode = "foundation", elements = [ 0 ] }
    , { number = 2, name = "Catch the drift", label = "TEMPO", description = "Learn which deck is faster and close the gap.", instruction = "Lesson 2: Use Randomize tempo on one deck, listen for drift, and move its pitch in tiny steps. Score 85+ to complete.", mode = "foundation", elements = [ 0 ] }
    , { number = 3, name = "Find the pocket", label = "PHASE", description = "Use a gentle nudge to align each transient.", instruction = "Lesson 3: Get the tempos close, then tap the nudge controls until the two kicks sound like one.", mode = "builder", elements = [ 0, 1 ] }
    , { number = 4, name = "Build the groove", label = "RHYTHM", description = "Add hats, snares, and percussion without losing the beat.", instruction = "Lesson 4: Match the groove with hats and snares. Add more elements as your ears settle in.", mode = "builder", elements = [ 0, 1, 2, 5 ] }
    , { number = 5, name = "Under the surface", label = "FOCUS", description = "Keep the kick in focus through bass and melody.", instruction = "Lesson 5: Add an Equalizer module to isolate the rhythm inside a full loop. Match both decks and score 85+.", mode = "builder", elements = [ 0, 1, 2, 3, 4, 5, 6 ] }
    , { number = 6, name = "Eyes closed, ears open", label = "BY EAR", description = "Let go of the BPM display. Trust your hearing.", instruction = "Lesson 6: BPM is hidden. Listen for the direction of drift, adjust the pitch, then nudge.", mode = "blind", elements = [ 0, 1, 2, 4 ] }
    , { number = 7, name = "Into the real world", label = "PRO DECKS", description = "Bring two real tracks together with cue points and EQ.", instruction = "Lesson 7: Load two tracks, find their first kicks, save cue points, then match by ear. Check to finish.", mode = "pro", elements = [ 0, 1, 2, 4 ] }
    , { number = 8, name = "Own the transition", label = "EXPERT", description = "Balance two tracks and make a confident handover.", instruction = "Lesson 8: Load two tracks, hide the BPM, and match their tempo and phase. Move the crossfader from one end to the other over at least 3 seconds while matched, then check.", mode = "pro", elements = [ 0, 1, 2, 4 ] }
    ]


learningView : Model -> Html Msg
learningView model =
    div [ class "learning-page" ]
        [ div [ class "page-heading" ] [ div [] [ div [ class "eyebrow" ] [ text "FROM FIRST BEAT TO FIRST MIX" ], h1 [] [ text "Good ears are built." ], p [] [ text "Eight small lessons. One skill that stays with you. Score 85 or more to complete each step." ] ], span [ class "large-progress" ] [ text (String.fromInt (List.length model.progress)), small [] [ text " / 8 complete" ] ] ]
        , div [ class "lesson-grid" ]
            (List.map
                (\lesson ->
                    let
                        complete =
                            List.member lesson.number model.progress

                        unlocked =
                            lesson.number == 1 || List.member (lesson.number - 1) model.progress || complete
                    in
                    article [ classList [ ( "lesson-card", True ), ( "complete", complete ), ( "locked", not unlocked ) ] ]
                        [ div [ class "lesson-top" ]
                            [ span [ class "lesson-number" ] [ text (pad2 lesson.number) ]
                            , span [ class "mini-badge" ]
                                [ text
                                    (if complete then
                                        "✓ COMPLETE"

                                     else
                                        lesson.label
                                    )
                                ]
                            ]
                        , h2 [] [ text lesson.name ]
                        , p [] [ text lesson.description ]
                        , button [ class "lesson-button", disabled (not unlocked), onClick (StartLesson lesson.number) ]
                            [ text
                                (if complete then
                                    "Practice again"

                                 else if unlocked then
                                    "Start lesson"

                                 else
                                    "Complete lesson " ++ String.fromInt (lesson.number - 1)
                                )
                            , span []
                                [ text
                                    (if unlocked then
                                        "↗"

                                     else
                                        "⌑"
                                    )
                                ]
                            ]
                        ]
                )
                lessons
            )
        , div [ class "path-note" ] [ strong [] [ text "Want to explore at your own pace?" ], p [] [ text "All four practice modes are always open. Your learning path tracks the foundations as you master them." ], button [ class "text-button", onClick (Navigate Practice) ] [ text "Back to the decks →" ] ]
        ]


trainingView : Model -> Html Msg
trainingView model =
    div [ class "training-page" ]
        [ div [ class "page-heading" ] [ div [] [ div [ class "eyebrow" ] [ text "REPETITION MAKES INSTINCT" ], h1 [] [ text "A sharper set of ears." ], p [] [ text "Focused drills for the skills behind a seamless mix. Pick one and make it click." ] ] ]
        , div [ class "training-stats" ] [ stat "PRACTICE CHECKS" (String.fromInt (List.length model.history)), stat "AVERAGE SCORE" (String.fromInt (average model.history)), stat "PERSONAL BEST" (String.fromInt (List.maximum model.history |> Maybe.withDefault 0)), stat "LESSONS COMPLETE" (String.fromInt (List.length model.progress) ++ "/8") ]
        , div [ class "drill-grid" ]
            (List.map
                (\( drill, ( icon, name, description ) ) ->
                    article [ class "drill-card" ] [ span [ class "drill-icon" ] [ text icon ], div [ class "eyebrow" ] [ text (String.toUpper drill ++ " TRAINING") ], h2 [] [ text name ], p [] [ text description ], button [ class "primary-button", onClick (StartDrill drill) ] [ text "Start drill", span [] [ text "↗" ] ] ]
                )
                [ ( "tempo", ( "↕", "Catch the tempo", "Focus on speed. Hear which loop is faster and close the BPM gap with precise pitch adjustments." ) )
                , ( "phase", ( "◎", "Lock the phase", "The tempos start matched. Use tiny nudges to bring the kicks into the very same moment." ) )
                , ( "blind", ( "◒", "Trust your ears", "No numbers to lean on. Learn to recognize drift, choose a direction, and hold the groove." ) )
                , ( "phrase", ( "▥", "Find the one", "Align the start of each four-bar phrase. Listen beyond individual kicks and feel the larger pattern." ) )
                ]
            )
        , section [ class "history-panel" ]
            [ div [ class "section-heading" ] [ h2 [] [ text "Your recent sessions" ], span [ class "mini-badge" ] [ text "SAVED ON THIS DEVICE" ] ]
            , if List.isEmpty model.history then
                p [ class "empty-state" ] [ text "Your first match is waiting. Check a match in Practice to start your story." ]

              else
                div [ class "history-bars", attribute "aria-label" "Recent match scores" ] (List.indexedMap (\index score -> div [ class "history-item" ] [ strong [] [ text (String.fromInt score) ], div [ class "history-bar" ] [ div [ style "height" (String.fromInt score ++ "%") ] [] ], small [] [ text ("#" ++ String.fromInt (List.length model.history - index)) ] ]) (List.take 12 model.history))
            ]
        ]


drillInstruction : String -> String
drillInstruction drill =
    case drill of
        "tempo" ->
            "Tempo drill: focus on pitch. Make the loops run at the same speed; this drill scores tempo accuracy."

        "phase" ->
            "Phase drill: the tempos are equal. Use nudge to align the kicks; keep the pitch at zero."

        "phrase" ->
            "Phrase drill: line up beat one of each 16-beat phrase. Use cue and nudge, then check your alignment."

        _ ->
            "Blind drill: keep BPM hidden. Listen carefully to the direction of drift, then correct it by ear."


stat : String -> String -> Html Msg
stat name val =
    div [ class "stat-card" ] [ span [] [ text name ], strong [] [ text val ] ]


skinsView : Model -> Html Msg
skinsView model =
    div [ class "skins-page" ]
        [ div [ class "page-heading" ] [ div [] [ div [ class "eyebrow" ] [ text "SAME GROOVE. DIFFERENT SHELL." ], h1 [] [ text "Your player. Your era." ], p [] [ text "A little chrome. A little phosphor. A lot of 2000. Make the decks feel like home." ] ] ]
        , div [ class "active-skin" ] [ span [ class "status-dot" ] [], text ("CURRENT SKIN · " ++ model.skinName) ]
        , div [ class "skin-grid" ]
            (List.map
                (\( skin, name, description ) ->
                    button
                        [ classList [ ( "skin-card", True ), ( "selected", model.skin == skin ) ]
                        , onClick (SelectSkin skin name)
                        , attribute "aria-pressed"
                            (if model.skin == skin then
                                "true"

                             else
                                "false"
                            )
                        ]
                        [ div [ class ("skin-preview skin-preview-" ++ skin) ]
                            [ img [ class "skin-original-image", src (model.basePath ++ "skins/" ++ skin ++ ".png"), alt (name ++ " original skin preview") ] []
                            ]
                        , div [ class "skin-card-copy" ]
                            [ strong [] [ text name ]
                            , span []
                                [ text
                                    (if model.skin == skin then
                                        "✓ ACTIVE"

                                     else
                                        "APPLY ↗"
                                    )
                                ]
                            , p [] [ text description ]
                            ]
                        ]
                )
                [ ( "classic", "Classic 2.91", "Violet panels, gold rails, and original green bitmap digits." )
                , ( "classified3", "Winamp 3 Classified", "Champagne metal, gold trim, and a black LCD." )
                , ( "classified5", "Winamp 5 Classified", "A polished silver shell with cobalt-blue displays." )
                , ( "bento", "Bento Classified", "Charcoal panels and cool steel-blue details." )
                , ( "alien", "Headspace · Alien Lime", "Acid-lime curves, alien energy, and purple transport buttons." )
                ]
            )
        , section [ class "skin-import-panel" ]
            [ div [ class "skin-import-icon" ] [ text "{ / }" ]
            , div [] [ div [ class "eyebrow" ] [ text "BUILT TO BE YOURS" ], h2 [] [ text "Make a skin of your own." ], p [] [ text "Choose a base layout in skin.toml, change its colors, and replace the frame, buttons, digits, or platter artwork. Import your ZIP to use it on this device." ], small [] [ text "TOML, ZIP skin pack, or classic Winamp WSZ · validated before applying" ] ]
            , div [ class "skin-import-actions" ] [ button [ class "primary-button", onClick ImportSkin ] [ text "↥ Import a skin" ], button [ class "secondary-button", onClick ExportSkin ] [ text "↓ Download template" ] ]
            ]
        , p [ class "skin-attribution" ] [ text "The early web had personality. Explore the originals at the ", a [ href "https://skins.webamp.org/", target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Winamp Skin Museum ↗" ], text ". These are native Bit Cheer adaptations of the original skins. ", a [ href (model.basePath ++ "credits.html"), target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Skin credits ↗" ] ]
        ]


helpView : Html Msg
helpView =
    div [ class "modal-backdrop" ]
        [ section [ class "help-modal", attribute "role" "dialog", attribute "aria-modal" "true", attribute "aria-labelledby" "help-title", custom "keydown" helpKeyDecoder ]
            [ div [ class "section-heading" ] [ h2 [ id "help-title" ] [ text "Hands on. Ears open." ], button [ id "help-close", class "help-button", onClick ToggleHelp, attribute "aria-label" "Close help" ] [ text "×" ] ]
            , p [] [ text "Match the tempo with pitch, then align the beats with nudge. Cue returns a deck to its saved starting point." ]
            , ul [ class "shortcut-list" ] (List.map (\( key, action ) -> li [] [ strong [] [ text key ], span [] [ text action ] ]) [ ( "SPACE", "Play / pause both decks (also in focus)" ), ( "A / B", "Play / pause one deck" ), ( "← / →", "Nudge deck B" ), ( "T", "Tap tempo" ) ])
            , p [] [ text "Pitch changes playback speed and musical pitch, just like a classic turntable. Split cue sends deck A left and deck B right. Waveforms support dragging and wheel zoom." ]
            , button [ id "help-return", class "primary-button", onClick ToggleHelp ] [ text "Back to the groove" ]
            ]
        ]


helpKeyDecoder : D.Decoder { message : Msg, stopPropagation : Bool, preventDefault : Bool }
helpKeyDecoder =
    D.field "key" D.string
        |> D.andThen
            (\key ->
                if key == "Tab" then
                    D.at [ "target", "id" ] D.string
                        |> D.map
                            (\controlId ->
                                { message =
                                    FocusHelp
                                        (if controlId == "help-close" then
                                            "help-return"

                                         else
                                            "help-close"
                                        )
                                , stopPropagation = True
                                , preventDefault = True
                                }
                            )

                else
                    D.fail "Only trap Tab inside the help dialog"
            )


toggle : String -> Bool -> (Bool -> Msg) -> Html Msg
toggle name enabled msg =
    toggleDisabled False name enabled msg


toggleDisabled : Bool -> String -> Bool -> (Bool -> Msg) -> Html Msg
toggleDisabled unavailable name enabled msg =
    label [ classList [ ( "toggle-label", True ), ( "disabled", unavailable ) ] ] [ input [ type_ "checkbox", checked enabled, onCheck msg, disabled unavailable ] [], span [ class "toggle-track" ] [], span [] [ text name ] ]


fixed : Int -> Float -> String
fixed decimals val =
    let
        factor =
            10 ^ decimals

        rounded =
            round (abs val * toFloat factor)

        whole =
            String.fromInt (rounded // factor)

        fraction =
            String.fromInt (modBy factor rounded) |> String.padLeft decimals '0'

        sign =
            if val < 0 then
                "−"

            else
                ""
    in
    sign
        ++ whole
        ++ (if decimals == 0 then
                ""

            else
                "." ++ fraction
           )


signed : Int -> Float -> String
signed decimals val =
    (if val >= 0 then
        "+"

     else
        ""
    )
        ++ fixed decimals val


pad2 : Int -> String
pad2 n =
    String.fromInt n |> String.padLeft 2 '0'


timeDisplay : Float -> String
timeDisplay seconds =
    let
        total =
            floor seconds
    in
    pad2 (total // 60) ++ ":" ++ pad2 (modBy 60 total)


average : List Int -> Int
average values =
    if List.isEmpty values then
        0

    else
        List.sum values // List.length values
