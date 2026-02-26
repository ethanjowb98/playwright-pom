const automation_members = [
    "Ethan Job Bascug",
    "Donna Mae Mozo",
    "Clelia Cyra Jaye Molanda",
] as Array<string>;

const hybrid_automation_members = [
    "Gladys Faith Veloso",
    "Virgil Matthew Baguio",
    "Alexander Manuel Huelar",
    "Jose Gabriel Adrian Garcia",
    "Jan Dave Presbitero",
    "Andrew Justine  Man"
] as Array<string>;

const new_members = [
    "Sandra Nakacwa",
    "April Joy Perez",
    "Stephen Bitum",
    "Cyrus Noel Carano-o",
    "Ken Carl Jabas"
] as Array<string>;

const cx_tech_members = [
    "Audrey Antoinette Donaldo",
    "Lorenzo Miguel Leonino",
    "Ronald Lim",
    "Patricia Abigail Marie Diez",
    "Rhaniella Dayle Caliao",
] as Array<string>;

const members = [...automation_members, ...hybrid_automation_members, ...new_members, ...cx_tech_members];

export const subtasks = {
    "[Meeting] Standup": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Meeting] Weekly Code Review": members,
    "[Meeting] Sprint Planning": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Meeting] One on One Meeting": members,
    "[Fill Up Form] Sprint Retrospective": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Fill Up Form] Peer/Lead Evaluation": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Create Document] Standup Slides": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Meeting] Sprint Retrospective": [...automation_members, ...hybrid_automation_members, ...new_members],
    "[Fill Up Form] Self Evaluation": members,
    "[Meeting] Programming Fundamentals": members,
} as Record<string, Array<string>>;
