port module Main exposing (main)

import Browser
import Browser.Dom
import Browser.Events
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


type alias Model =
    { page : Page
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
    | AddElement
    | Randomize
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


main : Program () Model Msg
main =
    Browser.element { init = init, update = update, view = view, subscriptions = subscriptions }


initialDeck : String -> Float -> Deck
initialDeck name bpm =
    { name = name, bpm = bpm, pitch = 0, playing = False, position = 0, duration = 32 * 60 / bpm, beat = 0, peak = 0, elements = [ 0 ], volume = 0.8, low = 0, mid = 0, high = 0, range = 8, loop = True }


init : () -> ( Model, Cmd Msg )
init _ =
    ( { page = Practice
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
      , skin = "classic"
      , skinName = "Classic 2.91"
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
            [ 0, 1, 2 ]

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

                next =
                    { model | mode = mode, a = resetDeck elements model.a, b = resetDeck elements model.b, hideBpm = mode == "blind", result = Nothing, drill = "", currentLesson = Nothing, page = Practice }
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
            in
            ( mapDeck deck (\d -> { d | elements = elements }) model, set deck "elements" (toFloat (mask elements)) )

        AddElement ->
            let
                add d =
                    case List.head (List.filter (\n -> not (List.member n d.elements)) (List.range 0 6)) of
                        Just n ->
                            { d | elements = d.elements ++ [ n ] }

                        Nothing ->
                            d

                next =
                    { model | a = add model.a, b = add model.b }
            in
            ( next, Cmd.batch [ set 0 "elements" (toFloat (mask next.a.elements)), set 1 "elements" (toFloat (mask next.b.elements)) ] )

        Randomize ->
            ( { model | result = Nothing, a = resetPitch model.a, b = resetPitch model.b }, send "randomize" [ ( "mode", E.string model.mode ), ( "elements", E.int (mask model.a.elements) ), ( "genre", E.string model.genre ) ] )

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
                    ( { model | help = False }, Task.attempt (\_ -> NoOp) (Browser.Dom.focus "help-open") )

                " " ->
                    update PlayBoth model

                "t" ->
                    update Tap model

                "r" ->
                    update Randomize model

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


resetDeck : List Int -> Deck -> Deck
resetDeck elements deck =
    { deck | elements = elements, pitch = 0, playing = False, position = 0, beat = 0, loop = True }


resetPitch : Deck -> Deck
resetPitch deck =
    { deck | pitch = 0, position = 0, beat = 0 }


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

        "track" ->
            let
                deck =
                    field "deck" D.int 0 data

                bpm =
                    field "bpm" D.float 120 data
            in
            ( mapDeck deck (\d -> { d | name = field "name" D.string d.name data, bpm = bpm, duration = field "duration" D.float (32 * 60 / bpm) data, pitch = 0, position = 0, playing = False }) model, Cmd.none )

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
                    { d | bpm = bpm, name = List.head (List.drop index names) |> Maybe.withDefault d.name, pitch = 0, position = 0, duration = 32 * 60 / bpm }
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
                            D.field "target" (D.map2 Tuple.pair (D.field "tagName" D.string) (D.oneOf [ D.field "role" D.string, D.succeed "" ]))
                                |> D.andThen
                                    (\( tag, role ) ->
                                        if List.member tag [ "INPUT", "SELECT", "TEXTAREA", "BUTTON" ] || role == "slider" then
                                            D.fail "Native control handles keyboard"

                                        else
                                            D.field "key" D.string |> D.map Key
                                    )
                    )
            )
        ]


view : Model -> Html Msg
view model =
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
            , span [] [ text "ELM + RUST / WASM", span [ class "footer-separator" ] [ text "·" ], text "BIT.CHEER v1.0", span [ class "footer-separator" ] [ text "·" ], a [ href "/credits.html", target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Credits & sources ↗" ] ]
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
            "Two decks. Two tempos. Train your ears to bring them together."


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
                        (if model.mode == "pro" then
                            "REAL TRACKS"

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
                [ toggle "Hide BPM" model.hideBpm HideBpm
                , toggle "Show EQ" model.advanced Advanced
                , button [ class "small-button", onClick Randomize, title "Change both tempos and patterns (R)" ] [ text "⤨ Randomize" ]
                ]
            ]
        , div [ class "deck-rack" ]
            [ div [ class "rack-title" ] [ span [] [ text "BIT.CHEER / DUAL DECK SYSTEM" ], span [ class "rack-grip" ] [ text "▥ ▥ ▥ ▥ ▥ ▥ ▥" ], span [] [ text "STEREO · 32-BIT FLOAT" ] ]
            , div [ class "decks" ] [ deckView model 0 model.a, deckView model 1 model.b ]
            , mixerView model
            , routingView model
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
            , if model.mode /= "pro" then
                button [ class "add-element-button", onClick AddElement, disabled (List.length model.a.elements == 7 && List.length model.b.elements == 7) ] [ text "+ Add an element to both decks" ]

              else
                span [ class "muted" ] [ text "Drag the waveforms to seek. Scroll to zoom." ]
            ]
        , if model.mode == "pro" then
            libraryView model

          else
            text ""
        , div [ class "lower-grid" ] [ coachView model, tapView model ]
        , div [ class "practice-tip" ] [ span [] [ text "A LITTLE POINTER" ], text "Match the speed first. Then use nudge to bring the kicks into the same moment." ]
        ]


deckView : Model -> Int -> Deck -> Html Msg
deckView model number deck =
    let
        letter =
            if number == 0 then
                "A"

            else
                "B"

        visible =
            not model.hideBpm

        effective =
            deck.bpm * (1 + deck.pitch / 100)
    in
    section [ class ("deck deck-" ++ String.toLower letter), attribute "aria-label" ("Deck " ++ letter) ]
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
        , div [ class "deck-screen" ]
            [ div [ class "track-title" ]
                [ span [] [ text "♫" ]
                , strong [] [ text deck.name ]
                , span [ class "loop-badge" ]
                    [ text
                        (if model.mode == "pro" then
                            "TRACK"

                         else
                            "LOOP"
                        )
                    ]
                ]
            , div [ class "lcd-row" ]
                [ div [ class "lcd bpm-display" ]
                    [ span [ class "lcd-number", attribute "data-testid" ("bpm-" ++ String.toLower letter) ]
                        [ text
                            (if visible then
                                fixed 2 effective

                             else
                                "---.--"
                            )
                        ]
                    , small [] [ text "BPM" ]
                    ]
                , div [ class "time-display" ]
                    [ span [ class "lcd-time" ] [ text (timeDisplay deck.position) ]
                    , small []
                        [ text
                            (if visible then
                                "SOURCE " ++ fixed 1 deck.bpm ++ " BPM"

                             else
                                "LISTEN. DON'T LOOK."
                            )
                        ]
                    ]
                ]
            , div [ class "waveform-wrap" ]
                [ canvas [ id ("waveform-" ++ String.toLower letter), class "waveform", attribute "width" "600", attribute "height" "88", attribute "aria-label" ("Deck " ++ letter ++ " waveform: drag to seek, scroll to zoom") ] []
                , div [ class "waveform-playhead" ] []
                , span [ class "waveform-label" ]
                    [ text
                        (if model.mode == "pro" then
                            "SEEK / SCROLL TO ZOOM"

                         else
                            "32-BEAT LOOP"
                        )
                    ]
                ]
            , div [ class "beat-row" ]
                [ div [ class "beat-indicators", attribute "aria-hidden" "true" ]
                    (List.map (\i -> span [ classList [ ( "beat-dot", True ), ( "on", deck.playing && modBy 4 (floor deck.beat) == i ) ] ] [ text (String.fromInt (i + 1)) ]) (List.range 0 3))
                , span [] [ text "4 / 4" ]
                , span []
                    [ text
                        (if visible then
                            "BAR " ++ pad2 (modBy 8 (floor deck.beat // 4) + 1)

                         else
                            "BY EAR"
                        )
                    ]
                ]
            ]
        , div [ class "deck-controls" ]
            [ div [ class "deck-main-controls" ]
                [ div [ class "jog-row" ]
                    [ div [ id ("jog-" ++ String.toLower letter), class "jog-wheel", attribute "tabindex" "0", attribute "role" "slider", attribute "aria-label" ("Deck " ++ letter ++ " jog wheel"), attribute "aria-valuemin" "0", attribute "aria-valuemax" (String.fromFloat deck.duration), attribute "aria-valuenow" (String.fromFloat deck.position), attribute "data-deck" (String.fromInt number) ]
                        [ div [ class "jog-grooves" ] [], div [ class "jog-label" ] [ strong [] [ text letter ], small [] [ text "BIT.CHEER" ] ], span [ class "jog-marker" ] [] ]
                    , div [ class "jog-description" ] [ strong [] [ text "FEEL THE GROOVE" ], small [] [ text "Scroll to nudge" ], small [] [ text "Drag to scrub" ], div [ class "zoom-controls" ] [ button [ class "small-button", onClick (Zoom number 0.5), attribute "aria-label" ("Zoom out deck " ++ letter ++ " waveform") ] [ text "−" ], span [] [ text "WAVE" ], button [ class "small-button", onClick (Zoom number 2), attribute "aria-label" ("Zoom in deck " ++ letter ++ " waveform") ] [ text "+" ] ] ]
                    ]
                , div [ class "transport" ]
                    [ button
                        [ classList [ ( "transport-play", True ), ( "engaged", deck.playing ) ]
                        , onClick (Play number)
                        , attribute "aria-label"
                            ((if deck.playing then
                                "Pause"

                              else
                                "Play"
                             )
                                ++ " deck "
                                ++ letter
                            )
                        ]
                        [ text
                            (if deck.playing then
                                "Ⅱ"

                             else
                                "▶"
                            )
                        ]
                    , button [ class "transport-cue", onClick (Cue number), title "Return to cue point and pause" ] [ text "CUE" ]
                    , button [ class "set-cue", onClick (SetCue number), title "Save current position as cue point", attribute "aria-label" ("Set cue deck " ++ letter) ] [ text "SET" ]
                    , div [ class "nudge-controls" ]
                        [ button [ onClick (Nudge number -0.04), attribute "aria-label" ("Nudge deck " ++ letter ++ " backward"), title "Nudge back 0.04 beats" ] [ text "−" ]
                        , span [] [ text "NUDGE" ]
                        , button [ onClick (Nudge number 0.04), attribute "aria-label" ("Nudge deck " ++ letter ++ " forward"), title "Nudge forward 0.04 beats" ] [ text "+" ]
                        ]
                    ]
                , if model.mode /= "pro" then
                    div [ class "element-panel" ]
                        [ div [ class "control-label" ] [ span [] [ text "BUILD THE LOOP" ], small [] [ text (String.fromInt (List.length deck.elements) ++ " / 7") ] ]
                        , div [ class "elements" ]
                            (List.indexedMap
                                (\index name ->
                                    button
                                        [ classList [ ( "element", True ), ( "enabled", List.member index deck.elements ) ]
                                        , onClick (Element number index)
                                        , attribute "aria-pressed"
                                            (if List.member index deck.elements then
                                                "true"

                                             else
                                                "false"
                                            )
                                        , attribute "aria-label" ("Deck " ++ letter ++ " " ++ name)
                                        ]
                                        [ span [ class "element-light" ] [], text name ]
                                )
                                [ "Kick", "Hi-hat", "Snare", "Clap", "Bass", "Perc", "Synth" ]
                            )
                        ]

                  else
                    div [ class "track-import" ] [ button [ class "small-button", onClick (ImportTrack number) ] [ text ("↥ Load a track into " ++ letter) ], small [] [ text "MP3, WAV, OGG, FLAC* · stays on your device" ] ]
                , if model.advanced then
                    div [ class "eq-controls" ]
                        (List.map (\( param, val ) -> label [ class "eq-control" ] [ span [] [ text (String.toUpper param) ], input [ type_ "range", A.min "-24", A.max "12", step "0.5", value (String.fromFloat val), onInput (DeckValue number param), attribute "aria-label" ("Deck " ++ letter ++ " " ++ param ++ " EQ") ] [], small [] [ text (signed 1 val ++ " dB") ] ]) [ ( "low", deck.low ), ( "mid", deck.mid ), ( "high", deck.high ) ])

                  else
                    text ""
                , div [ class "deck-options" ]
                    [ toggle "Loop" deck.loop (Loop number)
                    , if model.mode == "pro" then
                        div [ class "source-settings" ]
                            [ if visible then
                                label [ class "source-bpm" ] [ span [] [ text "SOURCE BPM" ], input [ type_ "number", A.min "40", A.max "300", step "0.01", value (fixed 2 deck.bpm), on "change" (D.map (SourceBpm number) targetValue), attribute "aria-label" ("Deck " ++ letter ++ " source BPM") ] [] ]

                              else
                                text ""
                            , button [ class "small-button", onClick (SetGrid number), title "Mark current position as the downbeat for phase and phrase checking", attribute "aria-label" ("Set beat grid deck " ++ letter) ] [ text "SET GRID" ]
                            ]

                      else
                        text ""
                    ]
                , div [ class "deck-volume-row" ]
                    [ label [] [ text "VOL", input [ type_ "range", A.min "0", A.max "1", step "0.01", value (String.fromFloat deck.volume), onInput (DeckValue number "volume"), attribute "aria-label" ("Deck " ++ letter ++ " volume") ] [] ]
                    , vuMeter deck.peak
                    ]
                ]
            , div [ class "pitch-section" ]
                [ div [ class "control-label" ] [ text "PITCH" ]
                , div [ class "pitch-track" ]
                    [ div [ class "pitch-ticks" ] [ span [] [ text ("+" ++ String.fromFloat deck.range) ], span [] [ text "0" ], span [] [ text ("−" ++ String.fromFloat deck.range) ] ]
                    , input [ class "vertical-fader", type_ "range", A.min (String.fromFloat -deck.range), A.max (String.fromFloat deck.range), step "0.01", value (String.fromFloat deck.pitch), onInput (Pitch number), attribute "aria-label" ("Deck " ++ letter ++ " pitch"), attribute "orient" "vertical" ] []
                    ]
                , div [ class "pitch-value" ] [ text (signed 2 deck.pitch ++ "%") ]
                , div [ class "pitch-fine" ] [ button [ onClick (PitchStep number -0.01), attribute "aria-label" ("Fine decrease deck " ++ letter ++ " pitch") ] [ text "−" ], button [ onClick (Pitch number "0"), title "Reset pitch" ] [ text "0" ], button [ onClick (PitchStep number 0.01), attribute "aria-label" ("Fine increase deck " ++ letter ++ " pitch") ] [ text "+" ] ]
                , select [ class "pitch-range", onInput (Range number), attribute "aria-label" ("Deck " ++ letter ++ " pitch range") ] (List.map (\r -> option [ value (String.fromInt r), selected (toFloat r == deck.range) ] [ text ("±" ++ String.fromInt r ++ "%") ]) [ 2, 4, 8, 16 ])
                ]
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
    section [ classList [ ( "output-routing", True ), ( "expanded", model.routingOpen ) ], attribute "aria-label" "Audio output routing" ]
        [ div [ class "routing-heading" ]
            [ button
                [ class "routing-toggle"
                , onClick ToggleRouting
                , attribute "aria-expanded"
                    (if model.routingOpen then
                        "true"

                     else
                        "false"
                    )
                , attribute "aria-controls" "routing-panel"
                ]
                [ text "Audio outputs"
                , span [ attribute "aria-hidden" "true" ]
                    [ text
                        (if model.routingOpen then
                            " −"

                         else
                            " +"
                        )
                    ]
                ]
            , small [] [ text summary ]
            ]
        , if model.routingOpen then
            div [ id "routing-panel", class "routing-panel" ]
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

          else
            text ""
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
        , small [ class "library-note" ] [ text "Imported tracks stay on your device. BPM estimates can be half or double time. *File support depends on your browser. ", a [ href "/credits.html", target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Music credits & licenses ↗" ] ]
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
    , { number = 2, name = "Catch the drift", label = "TEMPO", description = "Learn which deck is faster and close the gap.", instruction = "Lesson 2: Randomize, listen for drift, and move the pitch in tiny steps. Score 85+ to complete.", mode = "foundation", elements = [ 0 ] }
    , { number = 3, name = "Find the pocket", label = "PHASE", description = "Use a gentle nudge to align each transient.", instruction = "Lesson 3: Get the tempos close, then tap the nudge controls until the two kicks sound like one.", mode = "builder", elements = [ 0, 1 ] }
    , { number = 4, name = "Build the groove", label = "RHYTHM", description = "Add hats, snares, and percussion without losing the beat.", instruction = "Lesson 4: Match the groove with hats and snares. Add more elements as your ears settle in.", mode = "builder", elements = [ 0, 1, 2, 5 ] }
    , { number = 5, name = "Under the surface", label = "FOCUS", description = "Keep the kick in focus through bass and melody.", instruction = "Lesson 5: Use the EQ to isolate the rhythm inside a full loop. Match both decks and score 85+.", mode = "builder", elements = [ 0, 1, 2, 3, 4, 5, 6 ] }
    , { number = 6, name = "Eyes closed, ears open", label = "BY EAR", description = "Let go of the BPM display. Trust your hearing.", instruction = "Lesson 6: BPM is hidden. Listen for the direction of drift, adjust the pitch, then nudge.", mode = "blind", elements = [ 0, 1, 2, 4 ] }
    , { number = 7, name = "Into the real world", label = "PRO DECKS", description = "Bring two real tracks together with cue points and EQ.", instruction = "Lesson 7: Load two tracks, find their first kicks, save cue points, then match by ear. Check to finish.", mode = "pro", elements = [ 0, 1, 2, 4 ] }
    , { number = 8, name = "Own the transition", label = "EXPERT", description = "Balance two tracks and make a confident handover.", instruction = "Lesson 8: Load two tracks, hide the BPM, match their tempo and phase, then practice a smooth crossfade.", mode = "pro", elements = [ 0, 1, 2, 4 ] }
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
                            [ img [ class "skin-original-image", src ("/skins/" ++ skin ++ ".png"), alt (name ++ " original skin preview") ] []
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
                [ ( "classic", "Classic 2.91", "The original brushed graphite and phosphor-green classic." )
                , ( "classified3", "Winamp 3 Classified", "Champagne metal and mint-green displays." )
                , ( "classified5", "Winamp 5 Classified", "A polished silver shell with cobalt-blue displays." )
                , ( "bento", "Bento Classified", "Charcoal panels and cool steel-blue details." )
                , ( "alien", "Headspace · Alien Lime", "Acid-lime curves, alien energy, and purple transport buttons." )
                ]
            )
        , section [ class "skin-import-panel" ]
            [ div [ class "skin-import-icon" ] [ text "{ / }" ]
            , div [] [ div [ class "eyebrow" ] [ text "BUILT TO BE YOURS" ], h2 [] [ text "Make a skin of your own." ], p [] [ text "Start with a TOML theme. Change the colors, add your graphics, then import it. Your skin stays on this device." ], small [] [ text "TOML theme or ZIP skin pack · validated before applying" ] ]
            , div [ class "skin-import-actions" ] [ button [ class "primary-button", onClick ImportSkin ] [ text "↥ Import a skin" ], button [ class "secondary-button", onClick ExportSkin ] [ text "↓ Download template" ] ]
            ]
        , p [ class "skin-attribution" ] [ text "The early web had personality. Explore the originals at the ", a [ href "https://skins.webamp.org/", target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Winamp Skin Museum ↗" ], text ". These are native Bit Cheer adaptations of the original skins. ", a [ href "/credits.html", target "_blank", attribute "rel" "noopener noreferrer" ] [ text "Skin credits ↗" ] ]
        ]


helpView : Html Msg
helpView =
    div [ class "modal-backdrop" ]
        [ section [ class "help-modal", attribute "role" "dialog", attribute "aria-modal" "true", attribute "aria-labelledby" "help-title", custom "keydown" helpKeyDecoder ]
            [ div [ class "section-heading" ] [ h2 [ id "help-title" ] [ text "Hands on. Ears open." ], button [ id "help-close", class "help-button", onClick ToggleHelp, attribute "aria-label" "Close help" ] [ text "×" ] ]
            , p [] [ text "Match the tempo with pitch, then align the beats with nudge. Cue returns a deck to its saved starting point." ]
            , ul [ class "shortcut-list" ] (List.map (\( key, action ) -> li [] [ strong [] [ text key ], span [] [ text action ] ]) [ ( "SPACE", "Play / pause both decks" ), ( "A / B", "Play / pause one deck" ), ( "← / →", "Nudge deck B" ), ( "T", "Tap tempo" ), ( "R", "Randomize the challenge" ) ])
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
