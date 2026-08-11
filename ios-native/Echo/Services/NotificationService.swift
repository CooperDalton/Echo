import Foundation
import UserNotifications

enum NotificationService {
    private static let legacyDailyIdentifier = "echo-evening-checkin"
    private static let dailyIdentifierPrefix = "echo-daily-checkin-"
    private static let weeklyIdentifier = "echo-weekly-review"

    private static let dailyCheckInMessages = [
        "Quick vibe check: how are we doing in there?",
        "What’s the internal weather report?",
        "Pause. Feelings. Energy. Tiny debrief. Go.",
        "Tell Echo what happened before the lore gets fuzzy.",
        "Your daily emotional receipt is ready for inspection.",
        "Be honest: how weird was today?",
        "Check in before your brain files today under ‘miscellaneous.’",
        "A tiny check-in now saves three mysterious moods later.",
        "Roll call: brain? Body? Feelings? Anyone home?",
        "How’s the meat suit? How’s the ghost driving it?",
        "Stop scrolling through reality and report your vibes.",
        "Today happened. Allegedly. Care to document it?",
        "Your feelings called. They would like to be perceived.",
        "Energy level check: house cat or haunted Roomba?",
        "Give me the emotional patch notes for today.",
        "Tiny diary moment. No quill required.",
        "What flavor of human were you today?",
        "Before we close today’s tab, how did it go?",
        "Please rate today’s nonsense from one to five.",
        "Your brain made soup all day. What’s in it?",
        "Emotional inventory time. Mind the loose items.",
        "Check the gauges. Kick the tires. Name the feelings.",
        "How did today treat you, and do we need to fight it?",
        "Drop the daily lore before it vanishes into the void.",
        "Current status: thriving, surviving, or buffering?",
        "Your inner narrator owes us a quick recap.",
        "What happened today that Future You should know?",
        "Daily save point reached. Log your stats.",
        "Open the emotional fridge. What’s actually in there?",
        "Let’s inspect today without making it a whole thing.",
        "How’s your battery, bestie? Emotional and otherwise.",
        "Quick systems check before tomorrow installs itself.",
        "You contain multitudes. Which ones showed up today?",
        "Name the vibe before the vibe names you.",
        "A wild self-awareness opportunity appeared.",
        "Tell me about today. Gossip is an acceptable format.",
        "Did today slap, flop, or simply occur?",
        "Time to turn vague feelings into premium data.",
        "What’s rattling around in that beautiful skull?",
        "The council requests your daily emotional report.",
        "Check in now; dramatically misremember it later.",
        "How are we feeling, chief? Give it to me straight.",
        "Today’s episode is ending. Any notes for the writers?",
        "Your mood has entered the chat. What did it say?",
        "Take ten seconds and interview your own nervous system.",
        "What drained you? What charged you? What was just weird?",
        "Daily debrief, but make it emotionally literate.",
        "Pin today’s vibe to the evidence board.",
        "The day has been daying. How are you holding up?",
        "Describe today before sleep applies aggressive compression.",
        "Your internal dashboard has several blinking lights.",
        "Behold: a small portal to knowing yourself slightly better.",
        "Quick, catch the feeling before it changes costumes.",
        "What did your one precious brain cell learn today?",
        "Log the chaos. Preserve the character development.",
        "Today left fingerprints. Let’s take a look.",
        "No wrong answers, unless you say ‘fine’ and flee.",
        "Come on, protagonist. Give us the end-of-day monologue."
    ]

    private static let weeklyReviewMessages = [
        "Let’s get that recursive self-improvement, bitch.",
        "Time to review the season finale of this week.",
        "Plot check: what worked, what flopped, and what happens next?",
        "Congratulations, you survived another week. Debrief?",
        "Gather the lore. Extract the lessons. Plan the sequel.",
        "Weekly review: because character development deserves notes.",
        "Let’s turn hindsight into a tiny unfair advantage.",
        "Past you left some data. Future you would like a word.",
        "Another seven-day experiment concluded. Let’s see the results.",
        "Time to audit the chaos and expense the wisdom.",
        "Weekly boss battle complete. Check the loot.",
        "What did we learn, besides that time is fake?",
        "Open the week’s black box. We need answers.",
        "Let’s mine this week for lessons and funny little patterns.",
        "Seven days of content just dropped. Review the footage.",
        "Your week has submitted itself for peer review.",
        "Look back, learn something, become marginally unstoppable.",
        "It’s retrospective o’clock, you magnificent work in progress.",
        "Let’s separate this week’s signal from its absolute nonsense.",
        "Review the week before your memory replaces it with vibes.",
        "Time for a tasteful amount of personal growth.",
        "What worked? What didn’t? What are we blaming on Mercury?",
        "The week is over. Please collect your character development.",
        "Let’s make Future You suspiciously well prepared.",
        "Weekly review: now with 30% more emotional intelligence.",
        "Turn this week’s plot holes into next week’s strategy.",
        "Your life has analytics. Come stare at the dashboard.",
        "Debrief the week like the tiny personal empire it was.",
        "What should we keep, quit, or cackle about?",
        "Time to convert experience points into actual upgrades.",
        "This week had audacity. Let’s discuss.",
        "Grab the lessons before the calendar eats the evidence.",
        "Let’s lovingly interrogate your recent decisions.",
        "Weekly reflection: cheaper than repeating the same nonsense.",
        "You did seven whole days. Show your work.",
        "What deserves applause, adjustment, or immediate exile?",
        "Sit down, legend. The week requires a postmortem.",
        "Let’s review the wins, the whiffs, and the weird bits.",
        "The personal growth department requests five minutes.",
        "Time to ask whether the chaos was at least educational.",
        "Your weekly montage is ready for director’s commentary.",
        "Find the pattern. Steal the lesson. Improve the sequel.",
        "Before next week gets ideas, let’s make a plan.",
        "It’s giving reflection. It’s giving strategic evolution.",
        "Let’s rummage through the week and keep the useful parts.",
        "Weekly review: because winging it deserves quality control.",
        "What moved the plot forward, and what was filler?",
        "The calendar demands tribute in the form of self-awareness.",
        "Let’s turn seven days of nonsense into one good insight.",
        "Your future self asked me to make you review this week.",
        "Come collect the wisdom hiding under this week’s debris.",
        "Reflect, recalibrate, and return with unreasonable confidence.",
        "This is your scheduled appointment with the bigger picture.",
        "Weekly systems check: what sparked joy, dread, or paperwork?",
        "Let’s identify the lesson before life sends the same quiz again.",
        "Plot your next move, you emotionally complex chess piece.",
        "Take a breath. Review the arc. Choose the next adventure.",
        "Let’s get wiser without becoming unbearably serious."
    ]

    static func requestPermission() async throws -> Bool {
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    }

    static func applyReminderSchedule(
        daily: DailyCheckInPreferences,
        weekly: WeeklyReviewPreferences,
        requestPermissionIfNeeded: Bool
    ) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ownedIdentifiers = pending.map(\.identifier).filter {
            $0 == legacyDailyIdentifier || $0 == weeklyIdentifier || $0.hasPrefix(dailyIdentifierPrefix)
        }
        center.removePendingNotificationRequests(withIdentifiers: ownedIdentifiers)

        guard daily.enabled || weekly.enabled else { return }
        var settings = await center.notificationSettings()
        if requestPermissionIfNeeded, settings.authorizationStatus == .notDetermined {
            _ = try? await requestPermission()
            settings = await center.notificationSettings()
        }
        guard canSchedule(settings.authorizationStatus) else { return }

        if daily.enabled {
            for reminder in Set(daily.times) where
                (0...23).contains(reminder.hour) && (0...59).contains(reminder.minute) {
                let content = UNMutableNotificationContent()
                content.title = "Daily check-in"
                content.body = dailyCheckInMessages.randomElement()
                    ?? "Capture your energy, emotions, and what happened today."
                content.sound = nil
                content.userInfo = ["url": "/checkin-flow"]

                var components = DateComponents()
                components.hour = reminder.hour
                components.minute = reminder.minute
                let request = UNNotificationRequest(
                    identifier: dailyIdentifierPrefix + reminder.id.replacingOccurrences(of: ":", with: ""),
                    content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                )
                try? await center.add(request)
            }
        }

        if weekly.enabled,
           (1...7).contains(weekly.weekday),
           (0...23).contains(weekly.hour),
           (0...59).contains(weekly.minute) {
            let content = UNMutableNotificationContent()
            content.title = "Weekly review"
            content.body = weeklyReviewMessages.randomElement()
                ?? "Take a moment to reflect on this week and plan the next one."
            content.sound = nil
            content.userInfo = ["url": "/weekly-review"]

            var components = DateComponents()
            components.weekday = weekly.weekday
            components.hour = weekly.hour
            components.minute = weekly.minute
            let request = UNNotificationRequest(
                identifier: weeklyIdentifier,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            )
            try? await center.add(request)
        }
    }

    static func notifySyncFailure(_ message: String) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = "Sync failed"
        content.body = message
        let request = UNNotificationRequest(identifier: "echo-sync-failure", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    private static func canSchedule(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral: true
        case .notDetermined, .denied: false
        @unknown default: false
        }
    }
}
