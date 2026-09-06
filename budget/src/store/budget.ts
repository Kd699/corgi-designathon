import { create } from 'zustand'

export type Person = {
  id: string
  name: string
  department: string
  budget: number
  role?: string
  percentage: number
  teams?: Array<{
    name: string
    members: Array<{
      name: string
      budget: number
      role?: string
      subordinates?: Array<{
        name: string
        budget: number
        role: string
      }>
    }>
  }>
}

interface Achievement {
  id: string
  name: string
  date_earned: Date
  points: number
}

interface AutomationRule {
  id: string;
  name: string;
  basePointsPerPerson: number;
  schedule: 'monthly' | 'quarterly' | 'yearly';
  nextRunDate: Date;
  lastRunDate: Date | null;
  isActive: boolean;
  cadenceType: 'fixed' | 'rolling';
  cadenceValue?: number; // For rolling periods, number of days
  fixedDates?: string[]; // For fixed schedule, array of dates in MM-DD format
}

export interface DepartmentException {
  departmentId: string;
  userId: string;
  points: number;
  reason?: string;
}

interface BudgetStore {
  people: Person[];
  existingDepartments: string[];
  totalBudget?: number;
  automationRules: AutomationRule[];
  departmentExceptions: DepartmentException[];
  addPerson: (person: Person) => void;
  allocateBudget: (amount: number, targetName: string, isReclaim: boolean) => void;
  getRemainingBudget: (selectedPerson: Person | null, selectedTeam?: string | null, selectedTeamMember?: { name: string; budget: number; role?: string; } | null) => number;
  updatePerson: (updatedPerson: Person) => void;
  addAutomationRule: (rule: Omit<AutomationRule, 'id'>) => void;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => void;
  removeAutomationRule: (id: string) => void;
  addDepartmentException: (exception: DepartmentException) => void;
  updateDepartmentException: (departmentId: string, updates: Partial<DepartmentException>) => void;
  removeDepartmentException: (departmentId: string) => void;
}

// Export the department data
export const mojDepartments = [
  'Legal Services',
  'Policy and Strategy',
  'Finance',
  'Human Resources',
  'Information Technology',
  'Operations',
  'Communications',
  'Research',
  'Public Relations',
  'Administration',
  'Criminal Justice',
  'Civil Justice',
  'Court Services',
  'Probation Services',
  'Youth Justice',
  'Victim Support',
  'Prison Services',
  'Rehabilitation',
  'Legal Aid',
  'Dispute Resolution',
  'Data Protection',
  'Regulatory Affairs',
  'Constitutional Affairs',
  'International Law',
  'Family Justice',
  'Property Law',
  'Commercial Law',
  'Employment Law',
  'Immigration Law',
  'Environmental Law',
  'Tax Law',
  'Intellectual Property',
  'Corporate Governance',
  'Risk Management',
  'Compliance',
  'Internal Audit',
  'Security Services',
  'Digital Services',
  'Innovation',
  'Training & Development',
  'Quality Assurance',
  'Project Management',
  'Strategic Planning',
  'Performance Management',
  'Change Management',
  'Knowledge Management',
  'Facilities Management',
  'Emergency Planning',
  'Parliamentary Affairs',
  'Public Inquiries'
]

const celebrities = [
  'Morgan Freeman',
  'Brad Pitt',
  'Angelina Jolie',
  'Leonardo DiCaprio',
  'Meryl Streep',
  'Tom Hanks',
  'Julia Roberts',
  'Denzel Washington',
  'Nicole Kidman',
  'Robert De Niro',
  'Jennifer Lawrence',
  'Will Smith',
  'Cate Blanchett',
  'George Clooney',
  'Sandra Bullock',
  'Matt Damon',
  'Charlize Theron',
  'Johnny Depp',
  'Emma Stone',
  'Christian Bale',
  'Natalie Portman',
  'Hugh Jackman',
  'Scarlett Johansson',
  'Tom Cruise',
  'Anne Hathaway',
  'Daniel Day-Lewis',
  'Kate Winslet',
  'Russell Crowe',
  'Viola Davis',
  'Benedict Cumberbatch',
  'Jennifer Aniston',
  'Bradley Cooper',
  'Marion Cotillard',
  'Javier Bardem',
  'Helen Mirren',
  'Matthew McConaughey',
  'Julianne Moore',
  'Colin Firth',
  'Jessica Chastain',
  'Michael Fassbender',
  'Rachel McAdams',
  'Jake Gyllenhaal',
  'Emily Blunt',
  'Idris Elba',
  'Amy Adams',
  'Ryan Gosling',
  'Penélope Cruz',
  'Mark Ruffalo',
  'Reese Witherspoon',
  'Chris Hemsworth'
]

interface TeamMember {
  name: string
  budget: number
  role?: string
  subordinates?: Array<{
    name: string
    budget: number
    role: string
  }>
}

interface Team {
  name: string
  budget: number
  members: TeamMember[]
}

type DepartmentTeams = {
  [key: string]: Team[]
}

// Export the department teams
export const departmentTeams: DepartmentTeams = {
  'Legal Services': [
    { name: 'Intellectual Property Licensing', budget: 800000, members: [
      { name: 'Andrea Bocelli', budget: 800000, role: 'Team Lead', subordinates: [
        { name: 'Sarah Chang', budget: 250000, role: 'License Compliance Officer' },
        { name: 'Hilary Hahn', budget: 200000, role: 'IP Portfolio Manager' },
        { name: 'Vanessa Mae', budget: 180000, role: 'Rights Management Specialist' }
      ] }
    ]},
    { name: 'Patent Protection Unit', budget: 700000, members: [
      { name: 'Yo-Yo Ma', budget: 700000, role: 'Team Lead', subordinates: [
        { name: 'Itzhak Perlman', budget: 220000, role: 'Patent Analysis Lead' },
        { name: 'Joshua Bell', budget: 210000, role: 'Technical Documentation Specialist' },
        { name: 'Gil Shaham', budget: 190000, role: 'Patent Review Coordinator' }
      ] }
    ]},
    { name: 'Copyright Enforcement', budget: 600000, members: [
      { name: 'Lang Lang', budget: 600000, subordinates: [
        { name: 'Murray Perahia', budget: 200000, role: 'Copyright Protection Officer' },
        { name: 'Martha Argerich', budget: 190000, role: 'Digital Rights Manager' },
        { name: 'Vladimir Ashkenazy', budget: 180000, role: 'Content Verification Specialist' }
      ] }
    ]},
    { name: 'Trademark Registration', budget: 400000, members: [
      { name: 'Joshua Bell', budget: 400000, subordinates: [
        { name: 'Anne-Sophie Mutter', budget: 150000, role: 'Trademark Filing Specialist' },
        { name: 'Maxim Vengerov', budget: 140000, role: 'Brand Protection Analyst' },
        { name: 'Viktoria Mullova', budget: 130000, role: 'Registration Coordinator' }
      ] }
    ]},
    { name: 'Corporate Compliance', budget: 600000, members: [
      { name: 'Diana Krall', budget: 600000, subordinates: [
        { name: 'Keith Jarrett', budget: 200000, role: 'Compliance Audit Manager' },
        { name: 'Herbie Hancock', budget: 190000, role: 'Policy Implementation Lead' },
        { name: 'Brad Mehldau', budget: 180000, role: 'Regulatory Affairs Specialist' }
      ] }
    ]},
    { name: 'Legal Risk Management', budget: 500000, members: [
      { name: 'Michael Bublé', budget: 500000, subordinates: [
        { name: 'Tony Bennett', budget: 180000, role: 'Risk Assessment Lead' },
        { name: 'Harry Connick Jr.', budget: 170000, role: 'Legal Strategy Analyst' },
        { name: 'John Pizzarelli', budget: 160000, role: 'Compliance Review Specialist' }
      ] }
    ]},
    { name: 'Regulatory Affairs', budget: 500000, members: [
      { name: 'Jamie Cullum', budget: 500000, subordinates: [
        { name: 'Kurt Elling', budget: 180000, role: 'Regulatory Compliance Officer' },
        { name: 'Gregory Porter', budget: 170000, role: 'Policy Development Lead' },
        { name: 'Jane Monheit', budget: 160000, role: 'Standards Implementation Specialist' }
      ] }
    ]},
    { name: 'Contract Administration', budget: 400000, members: [
      { name: 'Gregory Porter', budget: 400000, subordinates: [
        { name: 'Stacey Kent', budget: 150000, role: 'Contract Review Manager' },
        { name: 'Melody Gardot', budget: 140000, role: 'Agreement Processing Lead' },
        { name: 'Sophie Milman', budget: 130000, role: 'Documentation Specialist' }
      ] }
    ]}
  ],
  'Policy and Strategy': [
    { name: 'Strategic Development', budget: 900000, members: [
      { name: 'Mick Jagger', budget: 900000, subordinates: [
        { name: 'David Byrne', budget: 300000, role: 'Strategy Planning Lead' },
        { name: 'Peter Gabriel', budget: 250000, role: 'Development Coordinator' },
        { name: 'Annie Lennox', budget: 200000, role: 'Strategic Analyst' }
      ] }
    ]},
    { name: 'Policy Implementation', budget: 800000, members: [
      { name: 'Roger Waters', budget: 800000, subordinates: [
        { name: 'David Gilmour', budget: 280000, role: 'Implementation Manager' },
        { name: 'Nick Mason', budget: 230000, role: 'Policy Coordinator' },
        { name: 'Richard Wright', budget: 190000, role: 'Process Specialist' }
      ] }
    ]},
    { name: 'Reform Initiatives', budget: 700000, members: [
      { name: 'Robert Plant', budget: 700000, subordinates: [
        { name: 'Jimmy Page', budget: 250000, role: 'Reform Lead' },
        { name: 'John Paul Jones', budget: 220000, role: 'Initiative Manager' },
        { name: 'John Bonham', budget: 180000, role: 'Change Specialist' }
      ] }
    ]},
    { name: 'Future Planning', budget: 600000, members: [
      { name: 'Dave Grohl', budget: 600000, subordinates: [
        { name: 'Taylor Hawkins', budget: 220000, role: 'Planning Lead' },
        { name: 'Pat Smear', budget: 190000, role: 'Future Analyst' },
        { name: 'Nate Mendel', budget: 170000, role: 'Strategy Coordinator' }
      ] }
    ]},
    { name: 'Policy Analysis', budget: 600000, members: [
      { name: 'Bob Dylan', budget: 600000, subordinates: [
        { name: 'Joan Baez', budget: 220000, role: 'Analysis Lead' },
        { name: 'Pete Seeger', budget: 190000, role: 'Policy Researcher' },
        { name: 'Woody Guthrie', budget: 170000, role: 'Data Analyst' }
      ] }
    ]}
  ],
  'Finance': [
    { name: 'Investment Banking', budget: 1000000, members: [
      { name: 'Madonna', budget: 1000000, subordinates: [
        { name: 'Cyndi Lauper', budget: 350000, role: 'Investment Director' },
        { name: 'Paula Abdul', budget: 300000, role: 'Banking Operations Lead' },
        { name: 'Janet Jackson', budget: 250000, role: 'Portfolio Manager' }
      ] }
    ]},
    { name: 'Asset Management', budget: 900000, members: [
      { name: 'Justin Timberlake', budget: 900000, subordinates: [
        { name: 'Lance Bass', budget: 300000, role: 'Asset Director' },
        { name: 'JC Chasez', budget: 250000, role: 'Portfolio Analyst' },
        { name: 'Chris Kirkpatrick', budget: 200000, role: 'Management Specialist' }
      ] }
    ]},
    { name: 'Portfolio Strategy', budget: 800000, members: [
      { name: 'Lady Gaga', budget: 800000, subordinates: [
        { name: 'Tony Bennett', budget: 280000, role: 'Strategy Director' },
        { name: 'Mark Ronson', budget: 230000, role: 'Portfolio Analyst' },
        { name: 'RedOne', budget: 190000, role: 'Investment Specialist' }
      ] }
    ]},
    { name: 'Market Analysis', budget: 800000, members: [
      { name: 'Taylor Swift', budget: 800000, subordinates: [
        { name: 'Ed Sheeran', budget: 280000, role: 'Analysis Lead' },
        { name: 'Jack Antonoff', budget: 230000, role: 'Market Researcher' },
        { name: 'Max Martin', budget: 190000, role: 'Data Specialist' }
      ] }
    ]}
  ],
  'Human Resources': [
    { name: 'Leadership Training', budget: 700000, members: [
      { name: 'John Legend', budget: 700000, subordinates: [
        { name: 'Stevie Wonder', budget: 250000, role: 'Training Director' },
        { name: 'Quincy Jones', budget: 220000, role: 'Leadership Coach' },
        { name: 'Lionel Richie', budget: 180000, role: 'Development Specialist' }
      ] }
    ]},
    { name: 'Talent Acquisition', budget: 600000, members: [
      { name: 'Alicia Keys', budget: 600000, subordinates: [
        { name: 'Mary J. Blige', budget: 220000, role: 'Recruitment Lead' },
        { name: 'Lauryn Hill', budget: 190000, role: 'Talent Scout' },
        { name: 'India.Arie', budget: 170000, role: 'HR Specialist' }
      ] }
    ]},
    { name: 'Performance Management', budget: 600000, members: [
      { name: 'Jennifer Hudson', budget: 600000, subordinates: [
        { name: 'Fantasia', budget: 220000, role: 'Performance Lead' },
        { name: 'Kelly Clarkson', budget: 190000, role: 'Management Analyst' },
        { name: 'Carrie Underwood', budget: 170000, role: 'Review Specialist' }
      ] }
    ]},
    { name: 'Career Development', budget: 600000, members: [
      { name: 'Sam Smith', budget: 600000, subordinates: [
        { name: 'Adele', budget: 220000, role: 'Development Lead' },
        { name: 'Ed Sheeran', budget: 190000, role: 'Career Coach' },
        { name: 'Jessie J', budget: 170000, role: 'Planning Specialist' }
      ] }
    ]}
  ],
  'Information Technology': [
    { name: 'Cloud Infrastructure', budget: 700000, members: [
      { name: 'Daft Punk', budget: 700000, subordinates: [
        { name: 'Justice', budget: 250000, role: 'Cloud Architect' },
        { name: 'Air', budget: 220000, role: 'Infrastructure Lead' },
        { name: 'Phoenix', budget: 180000, role: 'Systems Engineer' }
      ] }
    ]},
    { name: 'Cybersecurity', budget: 600000, members: [
      { name: 'Deadmau5', budget: 600000, subordinates: [
        { name: 'Skrillex', budget: 220000, role: 'Security Lead' },
        { name: 'Zedd', budget: 190000, role: 'Threat Analyst' },
        { name: 'Knife Party', budget: 170000, role: 'Security Engineer' }
      ] }
    ]},
    { name: 'Data Analytics', budget: 600000, members: [
      { name: 'Calvin Harris', budget: 600000, subordinates: [
        { name: 'Avicii', budget: 220000, role: 'Analytics Lead' },
        { name: 'David Guetta', budget: 190000, role: 'Data Scientist' },
        { name: 'Swedish House Mafia', budget: 170000, role: 'Data Engineer' }
      ] }
    ]},
    { name: 'Network Operations', budget: 600000, members: [
      { name: 'Skrillex', budget: 600000, subordinates: [
        { name: 'Diplo', budget: 220000, role: 'Network Lead' },
        { name: 'Major Lazer', budget: 190000, role: 'Operations Manager' },
        { name: 'Jack Ü', budget: 170000, role: 'Systems Administrator' }
      ] }
    ]}
  ],
  'Communications': [
    { name: 'Media Relations', budget: 800000, members: [
      { name: 'Chris Martin', budget: 800000, subordinates: [
        { name: 'Guy Berryman', budget: 280000, role: 'Media Director' },
        { name: 'Jonny Buckland', budget: 230000, role: 'PR Manager' },
        { name: 'Will Champion', budget: 190000, role: 'Communications Lead' }
      ] }
    ]},
    { name: 'Public Affairs', budget: 700000, members: [
      { name: 'Brandon Flowers', budget: 700000, subordinates: [
        { name: 'Dave Keuning', budget: 250000, role: 'Public Affairs Lead' },
        { name: 'Mark Stoermer', budget: 220000, role: 'Community Manager' },
        { name: 'Ronnie Vannucci Jr.', budget: 180000, role: 'Outreach Coordinator' }
      ] }
    ]},
    { name: 'Corporate Communications', budget: 800000, members: [
      { name: 'Adam Levine', budget: 800000, subordinates: [
        { name: 'James Valentine', budget: 280000, role: 'Corporate Lead' },
        { name: 'Jesse Carmichael', budget: 230000, role: 'Internal Comms Manager' },
        { name: 'Mickey Madden', budget: 190000, role: 'Content Strategist' }
      ] }
    ]},
    { name: 'Internal Communications', budget: 700000, members: [
      { name: 'Hayley Williams', budget: 700000, subordinates: [
        { name: 'Taylor York', budget: 250000, role: 'Internal Comms Lead' },
        { name: 'Zac Farro', budget: 220000, role: 'Employee Engagement Manager' },
        { name: 'Josh Farro', budget: 180000, role: 'Content Developer' }
      ] }
    ]}
  ]
}

const initialPeople: Person[] = [
  // Budget Admin
  {
    id: 'budget-admin',
    name: 'Mhlengi Mntungwa',
    department: 'Budget Admin',
    budget: 12000000,
    role: 'admin',
    percentage: 0,
    teams: []
  },
  // Other people
  ...celebrities.map((name, index) => {
    const department = mojDepartments[index % mojDepartments.length]
    const teams = departmentTeams[department] || []
    return {
      id: `person-${index}`,
      name,
      department,
      budget: 0,
      role: 'user',
      percentage: 0,
      teams: teams.map(team => ({
        name: team.name,
        members: team.members.map(member => ({
          name: member.name,
          budget: member.budget,
          role: member.role,
          ...(member.subordinates && {
            subordinates: member.subordinates.map(sub => ({
              name: sub.name,
              budget: sub.budget,
              role: sub.role
            }))
          })
        }))
      }))
    }
  })
]

const useBudgetStore = create<BudgetStore>((set, get) => ({
  people: initialPeople,
  existingDepartments: Array.from(new Set([
    ...mojDepartments,
    ...initialPeople.map(p => p.department),
    ...Object.keys(departmentTeams)
  ])).filter(dept => dept !== 'Budget Admin').sort(),
  totalBudget: 20000000,
  automationRules: [],
  departmentExceptions: [],
  addPerson: (person) => {
    set((state) => ({
      people: [...state.people, person]
    }))
  },
  allocateBudget: (amount: number, targetName: string, isReclaim: boolean) => {
    set((state) => {
      const newPeople = [...state.people];
      const targetIndex = newPeople.findIndex(p => p.name === targetName);
      const mhlengiIndex = newPeople.findIndex(p => p.name === 'Mhlengi Mntungwa');
      const morganIndex = newPeople.findIndex(p => p.name === 'Morgan Freeman');
      
      if (targetIndex !== -1 && mhlengiIndex !== -1 && morganIndex !== -1) {
        // Determine source and target based on who is allocating
        const isMhlengiAllocating = newPeople[mhlengiIndex].role === 'admin';
        
        if (isReclaim) {
          // Reclaiming money back to the allocator
          if (isMhlengiAllocating) {
            // Mhlengi reclaiming from target
            newPeople[targetIndex].budget -= amount;
            newPeople[mhlengiIndex].budget += amount;
          } else {
            // Morgan reclaiming from target
            newPeople[targetIndex].budget -= amount;
            newPeople[morganIndex].budget += amount;
          }
        } else {
          // Giving money to target
          if (isMhlengiAllocating) {
            // Mhlengi giving to target (including Morgan)
            if (targetName === 'Morgan Freeman') {
              newPeople[morganIndex].budget += amount;
              newPeople[mhlengiIndex].budget -= amount;
            } else {
              newPeople[targetIndex].budget += amount;
              newPeople[mhlengiIndex].budget -= amount;
            }
          } else {
            // Morgan giving to target
            if (targetName !== 'Morgan Freeman') {
              newPeople[targetIndex].budget += amount;
              newPeople[morganIndex].budget -= amount;
            }
          }
        }
      }
      
      return { people: newPeople };
    });
  },
  getRemainingBudget: (selectedPerson, selectedTeam, selectedTeamMember) => {
    const { people } = get()
    const allocator = people.find(p => p.name === 'Mhlengi Mntungwa')
    return allocator?.budget || 0
  },
  updatePerson: (updatedPerson: Person) => {
    set((state) => {
      const newPeople = state.people.map(person => 
        person.id === updatedPerson.id ? updatedPerson : person
      )
      return { people: newPeople }
    })
  },
  addAutomationRule: (rule) => {
    set((state) => ({
      automationRules: [...state.automationRules, { ...rule, id: crypto.randomUUID() }]
    }))
  },
  updateAutomationRule: (id, updates) => {
    set((state) => ({
      automationRules: state.automationRules.map(rule => 
        rule.id === id ? { ...rule, ...updates } : rule
      )
    }))
  },
  removeAutomationRule: (id) => {
    set((state) => ({
      automationRules: state.automationRules.filter(rule => rule.id !== id)
    }))
  },
  addDepartmentException: (exception) => {
    set((state) => ({
      departmentExceptions: [...state.departmentExceptions, exception]
    }))
  },
  updateDepartmentException: (departmentId, updates) => {
    set((state) => ({
      departmentExceptions: state.departmentExceptions.map(exception =>
        exception.departmentId === departmentId ? { ...exception, ...updates } : exception
      )
    }))
  },
  removeDepartmentException: (departmentId) => {
    set((state) => ({
      departmentExceptions: state.departmentExceptions.filter(
        exception => exception.departmentId !== departmentId
      )
    }))
  }
}))

export default useBudgetStore 