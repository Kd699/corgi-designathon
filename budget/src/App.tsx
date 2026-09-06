import { useState, useRef, useEffect, useMemo, ComponentProps } from 'react'
import useBudgetStore, { DepartmentException, Person as StorePerson } from './store/budget'
import { mojDepartments, departmentTeams } from './store/budget'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { Wallet, Search, Medal, Check, ArrowUpCircle, ArrowDownCircle, ChevronDown, MoreVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { BanknotesIcon } from "@heroicons/react/24/outline"
import { Breadcrumbs, BreadcrumbItemProps } from "./components/ui/breadcrumb"
import { NotificationButton } from './components/NotificationButton'
import useNotificationStore from './store/notifications'
import { PrototypingOverlay } from './components/PrototypingOverlay'

// Import the extended type definition
import type { ExtendedBreadcrumbItem } from "./components/ui/breadcrumb";

// Types
interface TeamMember {
  name: string;
  budget: number;
  role?: string;
  subordinates?: TeamMember[];
}

interface Team {
  name: string;
  members: TeamMember[];
}

type Person = StorePerson;

// State types
interface NewMemberForm {
  name: string;
  department: string;
  role: string;
  initialBudget: number;
}

type ModalState = {
  isOpen: boolean;
  type: 'menu' | 'edit' | null;
  personData: Person | null;
}

interface AutomationFormState {
  name: string; // Added name field
  basePointsPerPerson: string;
  schedule: 'monthly' | 'quarterly' | 'yearly';
  isActive: boolean;
  cadenceType: 'fixed' | 'rolling';
}

// Define a union type for items in displayPeople
type DisplayItem = (Person & { role: 'Budget Manager' | 'Budget User' }) | {
  id: string;
  name: string;
  department: string; // Represents location for units
  budget: number;
  role: 'Unit';
  percentage: number;
  storeManager: string;
  budgetManager: string;
}

export default function App() {
  const store = useBudgetStore()
  const { 
    totalBudget = 0, 
    people = [], 
    allocateBudget,
    updatePerson,
    automationRules,
    departmentExceptions,
    addAutomationRule,
    updateAutomationRule,
    removeAutomationRule,
    addDepartmentException,
    updateDepartmentException,
    removeDepartmentException
  } = store || {}

  const { addNotification } = useNotificationStore()

  // Track the budget admin separately
  const budgetAdmin = people.find(p => p.name === 'Mhlengi Mntungwa')
  const budgetAdminBudget = budgetAdmin?.budget || totalBudget

  const [searchQuery, setSearchQuery] = useState('')
  const [editingPerson, setEditingPerson] = useState<string | null>(null)
  const [inlineInputValue, setInlineInputValue] = useState('')
  const [savingPerson, setSavingPerson] = useState<string | null>(null)
  const [savedAmount, setSavedAmount] = useState<number | null>(null)
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null)
  const [departmentTotal, setDepartmentTotal] = useState<number>(0)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMember | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const allocationRef = useRef<HTMLDivElement>(null)
  const [showAllocationInput, setShowAllocationInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [savedPreview, setSavedPreview] = useState<{ total: number; budgetAdmin: number } | null>(null)
  const [transferMode, setTransferMode] = useState<'give' | 'reclaim'>('give')
  const [showTransferMenu, setShowTransferMenu] = useState(false)
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('')
  const [showRecipientSearch, setShowRecipientSearch] = useState(false)
  const [showSelectionSuccess, setShowSelectionSuccess] = useState(false)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [addMemberStep, setAddMemberStep] = useState(1)
  const [newMember, setNewMember] = useState<NewMemberForm>({
    name: '',
    department: '',
    role: '',
    initialBudget: 0
  })
  const [isNewDepartment, setIsNewDepartment] = useState(false)
  const [nameError, setNameError] = useState('')
  const [existingDepartments, setExistingDepartments] = useState<string[]>(() => {
    // Get departments from mojDepartments
    const allDepartments = new Set(mojDepartments)
    
    // Get departments from people
    people.forEach(p => {
      if (p.department && p.department !== 'Budget Admin') {
        allDepartments.add(p.department)
      }
    })

    // Get departments from departmentTeams
    Object.keys(departmentTeams).forEach((dept: string) => {
      allDepartments.add(dept)
    })

    // Convert to array and sort
    return Array.from(allDepartments)
      .filter(dept => dept !== 'Budget Admin')
      .sort((a: string, b: string) => a.localeCompare(b))
  })
  const [departmentSearchQuery, setDepartmentSearchQuery] = useState('')
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false)
  const [showInitialAllocation, setShowInitialAllocation] = useState(false)
  const [willAllocateBudget, setWillAllocateBudget] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showEditMemberModal, setShowEditMemberModal] = useState(false)
  const [editingMemberDetails, setEditingMemberDetails] = useState<Person | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  // Add state for the main view tabs
  const [mainViewTab, setMainViewTab] = useState<'allocation' | 'insights'>('allocation');

  // Replace multiple modal states with single controller
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: null,
    personData: null
  });

  // Add new state for active user context
  const [activeUserContext, setActiveUserContext] = useState<{
    name: string;
    role: string;
    department: string;
  } | null>(null);

  // Add this near the top where other state is defined
  const [currentUser, setCurrentUser] = useState('Mhlengi Mntungwa');

  const [pendingRequest, setPendingRequest] = useState<{
    requester: string;
    department: string;
    amount: number;
  } | null>(null);

  const [approvingRequest, setApprovingRequest] = useState<{
    personName: string;
    amount: number;
  } | null>(null);

  // Add new state for allocation modal
  const [activeTab, setActiveTab] = useState<'manual' | 'automation'>('manual')
  const [automationForm, setAutomationForm] = useState<AutomationFormState>({
    name: '',
    basePointsPerPerson: '',
    schedule: 'monthly',
    isActive: true,
    cadenceType: 'fixed'
  })
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [departmentMultipliers, setDepartmentMultipliers] = useState<Record<string, number>>({})
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const [currentException, setCurrentException] = useState<DepartmentException | null>(null)

  // Add new state for allocation preview
  const [allocationPreview, setAllocationPreview] = useState<{
    total: number;
    departments: {
      name: string;
      headcount: number;
      allocation: number;
      people: {
        id: string;
        name: string;
        basePoints: number;
        extraPoints: number;
        totalPoints: number;
      }[];
    }[];
  } | null>(null);

  // Add state for organization structure
  const [organizationType, setOrganizationType] = useState<'centralized' | 'decentralized'>('centralized');
  const [activeUnit, setActiveUnit] = useState<string | null>(null);
  const [units, setUnits] = useState<{
    name: string;
    location: string;
    storeManager: string;
    budgetManager: string;
  }[]>([
    { name: 'HQ', location: 'London', storeManager: 'Mat Hoffman', budgetManager: 'Dave Mirra' },
    { name: 'Store 1', location: 'Manchester', storeManager: 'Jamie Bestwick', budgetManager: 'Ryan Nyquist' },
    { name: 'Store 2', location: 'Bristol', storeManager: 'Harry Main', budgetManager: 'Mark Webb' },
    { name: 'Store 3', location: 'Glasgow', storeManager: 'Kriss Kyle', budgetManager: 'Alex Coleborn' }
  ]); // Remove the incorrect [0]

  const breadcrumbItems = useMemo(() => {
    if (currentUser === 'Morgan Freeman') {
      return [{ label: "Legal Services", onClick: () => {} }];
    }
    
    // Use Omit directly, BreadcrumbItemProps might still be needed if defined in breadcrumb.tsx
    const items: ExtendedBreadcrumbItem[] = []; // Explicitly type the array

    if (organizationType === 'decentralized') {
      if (activeUnit) {
        const unitData = units.find(u => u.name === activeUnit);
        if (unitData) {
          // First item: Unit Location with Manager/Points details
          items.push({
            label: unitData.location, 
            managerName: unitData.budgetManager,
            managerBudget: 0, // Placeholder for points
            onClick: () => { // Clicking the unit item goes back to Unit list
              setActiveUnit(null);
              setActiveDepartment(null);
              setSelectedPerson(null);
            },
            isUnitPill: false // Explicitly set for standard item
          });
          // Second item: All Departments (within this unit)
          items.push({
            label: "All Departments",
            onClick: () => {
              setActiveDepartment(null);
              setSelectedPerson(null);
            },
            isUnitPill: false // Explicitly set for standard item
          });
        } else {
           // Fallback if unit data not found: Show Units button
           items.push({ 
             label: "Units", 
             onClick: () => { setActiveUnit(null); setActiveDepartment(null); setSelectedPerson(null); },
             isUnitPill: false // Explicitly set for standard item
           });
        }
      } else {
        // No active unit, show the "Units" button (as a unit pill)
        // TODO: Decide if this should show a unit pill or standard item
        // For now, using standard item based on previous logic
        items.push({ 
          label: "Units", 
          onClick: () => {}, 
          isUnitPill: false // Explicitly set for standard item
        }); 
      }
    } else {
      // Centralized: Start with "All Departments"
      items.push({ 
        label: "All Departments", 
        onClick: () => { setActiveDepartment(null); setSelectedPerson(null); },
        isUnitPill: false // Explicitly set for standard item
      });
    }

    // Add active department if applicable (and not the first or second item already handled)
    if (activeDepartment && currentUser !== 'Morgan Freeman') {
       // Check if the last item added isn't already this department
       // (To avoid adding it twice if it was the unit/location item)
       if (items.length === 0 || items[items.length - 1].label !== activeDepartment) {
         items.push({
           label: activeDepartment,
           managerName: selectedPerson?.name,
           managerBudget: selectedPerson?.budget,
           onClick: () => {}, // Clicking current department does nothing
           isUnitPill: false // Explicitly set for standard item
         });
       }
    }

    return items;
  }, [currentUser, organizationType, activeUnit, activeDepartment, selectedPerson, units]);

  // Update current user handler to include organization structure changes
  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    // Reset any specific views when user changes
    resetViewToAllDepartments();
    setActiveUnit(null);
  };
  
  // Handle organization structure change
  const handleOrganizationChange = (type: 'centralized' | 'decentralized') => {
    setOrganizationType(type);
    // Reset to default views when changing organization type
    resetViewToAllDepartments();
    setActiveUnit(null);
  };
  
  // Handle unit selection for decentralized structure
  const handleUnitSelect = (unit: string) => {
    setActiveUnit(unit);
    // Simply set the active unit and ensure no department is selected
    // This will make displayPeople show the list of department heads
    setActiveDepartment(null);
    // No need to find the manager or their department anymore
    // const selectedUnit = units.find(u => u.name === unit);
    // if (selectedUnit) {
    //   const managerName = selectedUnit.budgetManager;
    //   const manager = people.find(p => p.name === managerName);
    //   if (manager) {
    //     setActiveDepartment(manager.department);
    //   }
    // }
  };

  // Subscribe to store changes with more detailed logging
  useEffect(() => {
    if (isSaved) {
      console.log('💰 Budget State Updated:', {
        total: {
          value: totalBudget.toLocaleString(),
          changed: totalBudget !== 20000000
        },
        budgetAdmin: {
          value: budgetAdminBudget.toLocaleString(),
          changed: budgetAdminBudget !== 12000000
        }
      })
    }
  }, [totalBudget, budgetAdminBudget, isSaved])

  // Add click outside handler for the menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && 
          !menuRef.current.contains(event.target as Node) && 
          !document.querySelector('.modal-content')?.contains(event.target as Node)) {
        requestAnimationFrame(() => {
          setActiveMenu(null);
        });
      }
    }

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [activeMenu]);

  // Update menu button click handler
  const handleMenuClick = (person: Person) => {
    setModalState({
      isOpen: true,
      type: 'menu',
      personData: person
    });
  };

  // Update edit details handler
  const handleEditDetails = (person: Person) => {
    // Set form data first
    setNewMember({
      name: person.name,
      department: person.department,
      role: person.role || 'user',
      initialBudget: 0
    });
    
    // Set edit mode and details
    setEditingMemberDetails(person);
    setIsEditMode(true);
    
    // Show modal - same as Add Member
    setShowAddMemberModal(true);
    
    // Close menu
    setModalState({
      isOpen: false,
      type: null,
      personData: null
    });
  };

  // Update close handler
  const handleCloseModal = () => {
    setModalState({
      isOpen: false,
      type: null,
      personData: null
    });
  };

  const handleDelete = (person: Person) => {
    setActiveMenu(null)
    // TODO: Implement delete functionality
    console.log('Delete:', person.name)
  }

  const filteredPeople = people?.filter((person) => {
    const query = searchQuery.toLowerCase().trim()
    
    // If Morgan Freeman is selected, show Legal Services members
    if (selectedPerson?.name === 'Morgan Freeman') {
      return person.department === 'Legal Services' && 
             person.name !== 'Morgan Freeman' &&
             (query === '' || person.name.toLowerCase().includes(query))
    }
    
    // If a person is selected, only show their subordinates
    if (selectedPerson) {
      return selectedPerson.teams?.some(team => 
        team.members.some(member => member.name.toLowerCase().includes(query))
      ) || false
    }
    
    // Exclude Mhlengi Mntungwa from the general list
    if (person.name === 'Mhlengi Mntungwa') {
      return false
    }
    
    return query === '' || 
      person.name.toLowerCase().includes(query) ||
      person.department.toLowerCase().includes(query)
  }) || []

  const handlePersonClick = (person: { name: string, department: string, budget: number }) => {
    // Set department and update breadcrumb navigation
    setActiveDepartment(person.department)
    
    // Find the person's complete data including teams
    const personWithTeams = people.find(p => p.name === person.name)
    
    if (personWithTeams) {
      // Get department teams data for the person's department
      const deptTeams = departmentTeams[person.department] || []
      
      // Get all department members except the department head
      const departmentMembers = people
        .filter(p => p.department === person.department && p.name !== person.name)
        .map(member => {
          // All members should be Budget Users
          return {
            name: member.name,
            budget: member.budget,
            role: 'Budget User',
            subordinates: (deptTeams
              .find(team => team.members.some(m => m.name === member.name))
              ?.members
              .find(m => m.name === member.name)
              ?.subordinates || [])
              .map(sub => ({
                name: sub.name,
                budget: people.find(p => p.name === sub.name)?.budget || 0,
                role: 'Budget User'
              }))
          }
        })

      // Set the selected person with their team structure
      setSelectedPerson({
        ...personWithTeams,
        role: 'Budget Manager',
        teams: [{
          name: person.department,
          members: departmentMembers
        }]
      })
    }
    
    // Reset team selection
    setSelectedTeam(null)
    setSelectedTeamMember(null)
    
    // Calculate total budget for this department
    const deptTotal = people
      .filter(p => p.department === person.department)
      .reduce((sum, p) => sum + p.budget, 0)
    setDepartmentTotal(deptTotal)
  }

  const handleTeamClick = (teamName: string) => {
    setSelectedTeam(teamName)
    setSelectedTeamMember(null)
  }

  const handleTeamMemberClick = (member: { 
    name: string, 
    budget: number, 
    department: string
  }) => {
    const team = selectedPerson?.teams?.find(t => t.name === member.department)
    const teamMember = team?.members.find(m => m.name === member.name)
    if (teamMember) {
      setSelectedTeamMember(teamMember)
      // Update the budget admin card to show team member's details
      setSelectedPerson(prev => prev ? {
        ...prev,
        name: teamMember.name,
        budget: teamMember.budget,
        department: member.department // This will be the team name
      } : null)
    }
  }

  // Update displayPeople logic
  const displayPeople = useMemo((): DisplayItem[] => {
    // If in decentralized mode and no unit is selected, show units instead of departments
    if (organizationType === 'decentralized' && !activeUnit) {
      // Map units to the DisplayItem type with role 'Unit'
      return units.map(unit => ({
        id: unit.name,
        name: unit.name,
        department: unit.location,
        budget: 0, 
        role: 'Unit',
        percentage: 0,
        storeManager: unit.storeManager,
        budgetManager: unit.budgetManager
      }));
    }
    
    // If we're viewing Morgan Freeman's Legal Services department
    if (selectedPerson?.name === 'Morgan Freeman' && activeDepartment === 'Legal Services') {
      // Get Legal Services team structure from departmentTeams
      const legalServicesTeams = departmentTeams['Legal Services'] || []
      
      // Return team leads with their subordinates
      return legalServicesTeams.map(team => {
        const teamLead = team.members[0] // Each team has one lead
        return {
          id: `${teamLead.name}-lead`,
          name: teamLead.name,
          department: 'Legal Services',
          budget: teamLead.budget,
          role: 'Budget User', // Explicitly Budget User
          percentage: 0,
          subordinates: teamLead.subordinates?.map(sub => ({
            name: sub.name,
            budget: sub.budget,
            role: 'Budget User'
          }))
        } as Person & { role: 'Budget User' } // Cast to ensure type correctness
      })
    }
    
    // Default view (All Departments) - Show only department heads
    // This also applies when organizationType is decentralized and a unit is active
    return people
      .filter(person => {
        const query = searchQuery.toLowerCase().trim()
        
        // Exclude Mhlengi Mntungwa from the list
        if (person.name === 'Mhlengi Mntungwa') return false
        
        // For decentralized mode with unit selected, filter by current unit's manager - REMOVED THIS LOGIC
        // if (organizationType === 'decentralized' && activeUnit) {
        //   const unitManager = units.find(u => u.name === activeUnit)?.budgetManager;
        //   // Only show departments managed by this unit's manager
        //   if (unitManager && person.name !== unitManager) return false;
        // }
        
        // Check if person is a department head (has a team in departmentTeams)
        const isDepartmentHead = Object.entries(departmentTeams).some(([dept, teams]) => {
          return dept === person.department
        })
        
        // Only show department heads in the main view
        if (!isDepartmentHead) return false
        
        // Apply search filter
        return query === '' || 
          person.name.toLowerCase().includes(query) ||
          person.department.toLowerCase().includes(query)
      })
      .map(person => ({
        ...person,
        role: 'Budget Manager' // All people shown in main view are Budget Managers
      } as Person & { role: 'Budget Manager' })) // Cast to ensure type correctness
  }, [selectedPerson, activeDepartment, searchQuery, people, organizationType, activeUnit, units])

  // Get current user's budget safely
  const getCurrentUserBudget = () => {
    if (currentUser === 'Morgan Freeman') {
      return people.find(p => p.name === 'Morgan Freeman')?.budget || 0;
    }
    return people.find(p => p.name === 'Mhlengi Mntungwa')?.budget || 0;
  };

  // Get preview budget based on current input
  const getPreviewBudget = () => {
    const amount = Number(inputValue.replace(/,/g, ''))
    if (isNaN(amount)) return null

    const budgetAdmin = people.find(p => p.name === 'Mhlengi Mntungwa')
    if (!budgetAdmin) return null

    return {
      total: totalBudget - amount,
      budgetAdmin: budgetAdmin.budget + amount
    }
  }

  const preview = getPreviewBudget()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSaved(false)
    setInputValue(e.target.value)
    
    // Log preview values
    const preview = getPreviewBudget()
    if (preview) {
      console.log('💰 Preview Values:', {
        input: e.target.value,
        total: {
          current: totalBudget.toLocaleString(),
          preview: preview.total.toLocaleString(),
          change: (preview.total - totalBudget).toLocaleString()
        },
        budgetAdmin: {
          current: people.find(p => p.name === 'Mhlengi Mntungwa')?.budget.toLocaleString(),
          preview: preview.budgetAdmin.toLocaleString(),
          change: (preview.budgetAdmin - (people.find(p => p.name === 'Mhlengi Mntungwa')?.budget || 0)).toLocaleString()
        }
      })
    }
  }

  const handleSave = () => {
    const amount = Number(inputValue.replace(/,/g, ''))
    if (isNaN(amount)) return

    const targetName = selectedPerson?.name
    if (!targetName) return

    // Show saving animation
    setSavingPerson(targetName)
    setSavedAmount(amount)
    setIsSaved(true)
    if (preview) {
      setSavedPreview(preview)
    }

    // Delay the actual allocation to show transition
    setTimeout(() => {
      allocateBudget(amount, targetName, transferMode === 'reclaim')
      
      // Show success animation
      setShowSelectionSuccess(true)
      setTimeout(() => {
        setShowSelectionSuccess(false)
        setSavingPerson(null)
        setSavedAmount(null)
        setInputValue('')
        setShowAllocationInput(false)
        setShowAllocationModal(false)
        setIsSaved(false)
        setSavedPreview(null)
      }, 1500)
    }, 500)
  }

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (allocationRef.current && !allocationRef.current.contains(event.target as Node)) {
        // Only reset if we're not in inline editing mode
        if (!editingPerson) {
          setInputValue('')
          setShowAllocationInput(false)
        }
        // Always close the transfer menu when clicking outside
        setShowTransferMenu(false)
      }
    }

    if (showAllocationInput || showTransferMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showAllocationInput, editingPerson, showTransferMenu])

  // Add new function to reset view state
  const resetViewToAllDepartments = () => {
    setActiveDepartment(null)
    setDepartmentTotal(0)
    setSelectedPerson(null)
    setSelectedTeam(null)
    setSelectedTeamMember(null)
  }

  // Update allocation confirmation handler
  const handleAllocationConfirm = (amount: number) => {
    if (!isNaN(amount) && selectedPerson) {
      setSavingPerson(selectedPerson.name)
      setSavedAmount(amount)
      allocateBudget(amount, selectedPerson.name, transferMode === 'reclaim')
      setTimeout(() => {
        setSavingPerson(null)
        setSavedAmount(null)
        setShowAllocationModal(false)
        setInlineInputValue('')
        resetViewToAllDepartments()
      }, 1000)
    }
  }

  // Add filtered recipients logic
  const filteredRecipients = recipientSearchQuery.trim() === '' ? [] : people
    .filter(person => person.name !== 'Mhlengi Mntungwa')
    .filter(person => 
      person.name.toLowerCase().includes(recipientSearchQuery.toLowerCase()) ||
      person.department.toLowerCase().includes(recipientSearchQuery.toLowerCase())
    )

  // Add click outside handler for recipient search
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!event.target) return
      const target = event.target as HTMLElement
      if (!target.closest('.recipient-search')) {
        setShowRecipientSearch(false)
      }
    }

    if (showRecipientSearch) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showRecipientSearch])

  // Add name validation function
  const validateName = (name: string) => {
    if (name.length < 2) return 'Name must be at least 2 characters'
    if (!/^[a-zA-Z\s]*$/.test(name)) return 'Name can only contain letters and spaces'
    if (people.some(p => p.name.toLowerCase() === name.toLowerCase())) return 'This name already exists'
    return ''
  }

  // Add function to create new member
  const createNewMember = (member: NewMemberForm) => {
    // Create new member object
    const newPerson: StorePerson = {
      id: `${member.department}-${member.name}`,
      name: member.name,
      department: member.department,
      budget: member.initialBudget,
      percentage: 0,
      role: member.role
    };

    // Update store with new member
    store.addPerson(newPerson);

    // If there's an initial budget, allocate it
    if (member.initialBudget > 0) {
      allocateBudget(member.initialBudget, member.name, false);
    }

    // Reset states
    setNewMember({
      name: '',
      department: '',
      role: '',
      initialBudget: 0
    });
    setWillAllocateBudget(false);
    setShowInitialAllocation(false);
    setDepartmentSearchQuery('');
    setIsNewDepartment(false);

    // Update existing departments if it's a new department
    if (!existingDepartments.includes(member.department)) {
      setExistingDepartments(prev => [...prev, member.department]);
    }
  };

  // Add effect to track modal state
  useEffect(() => {
    if (showAddMemberModal) {
      console.log('Modal should be visible:', {
        isEditMode,
        showAddMemberModal,
        editingMemberDetails: editingMemberDetails?.name
      });
      
      // Ensure body scroll is locked when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddMemberModal, isEditMode, editingMemberDetails]);

  // Add effect to debug modal state
  useEffect(() => {
    console.log('Modal visibility changed:', {
      showAddMemberModal,
      isEditMode,
      editingMemberDetails: editingMemberDetails?.name,
      newMember
    });
  }, [showAddMemberModal, isEditMode, editingMemberDetails, newMember]);

  // Add filtered departments logic
  const filteredDepartments = departmentSearchQuery.trim() === '' 
    ? existingDepartments 
    : existingDepartments.filter(dept => 
        dept.toLowerCase().includes(departmentSearchQuery.toLowerCase())
      );

  // Modify the Add Member Modal's close handler
  const handleCloseAddMemberModal = () => {
    console.log('Closing modal');
    setShowAddMemberModal(false);
    setIsEditMode(false);
    setEditingMemberDetails(null);
    setShowDepartmentDropdown(false);
    if (!isEditMode) {
      setNewMember({
        name: '',
        department: '',
        role: '',
        initialBudget: 0
      });
    }
  };

  // Add department selection handler
  const handleDepartmentSelect = (department: string) => {
    setNewMember(prev => ({ ...prev, department }));
    setDepartmentSearchQuery(department);
    setShowDepartmentDropdown(false);
  };

  // Add click outside handler for department dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!event.target) return;
      const target = event.target as HTMLElement;
      if (!target.closest('.department-dropdown')) {
        setShowDepartmentDropdown(false);
      }
    }

    if (showDepartmentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDepartmentDropdown]);

  // Modify the Add Member button click handler
  const handleAddMemberClick = () => {
    setShowAddMemberModal(true)
    setAddMemberStep(1)
    setIsEditMode(false)
    setNewMember({
      name: '',
      department: '',
      role: '',
      initialBudget: 0
    })
  }

  // Add more console logs to track modal state
  useEffect(() => {
    console.log('🔄 Modal state changed:', {
      showAddMemberModal,
      isEditMode,
      editingMemberDetails: editingMemberDetails?.name,
      activeMenu
    });
  }, [showAddMemberModal, isEditMode, editingMemberDetails, activeMenu]);

  const calculateTotalPoints = () => {
    if (selectedTeamMember) {
      return selectedTeamMember.subordinates?.reduce((total, sub) => total + (sub.budget || 0), 0) || 0;
    }
    
    if (selectedPerson && selectedTeam) {
      return selectedPerson.teams?.find(t => t.name === selectedTeam)?.members?.reduce((total, member) => total + (member.budget || 0), 0) || 0;
    }
    
    if (selectedPerson?.teams) {
      return selectedPerson.teams.reduce((teamTotal: number, team) => {
        const teamSum = team.members?.reduce((memberTotal, member) => memberTotal + (member.budget || 0), 0) || 0;
        return teamTotal + teamSum;
      }, 0);
    }
    
    return 0;
  };

  // Add this effect near other useEffect hooks
  useEffect(() => {
    console.log('👀 View State:', {
      user: currentUser,
      dept: activeDepartment,
      total: calculateTotalPoints(),
      peopleShown: displayPeople.length
    });
  }, [currentUser, activeDepartment, displayPeople]);

  // Add this effect near the top after state declarations
  useEffect(() => {
    console.log('🔄 Complete State Update:', {
      currentUser,
      activeDepartment,
      selectedPerson: selectedPerson ? {
        name: selectedPerson.name,
        department: selectedPerson.department,
        budget: selectedPerson.budget
      } : null,
      activeUserContext,
      displayPeople: displayPeople.map(p => ({
        name: p.name,
        department: p.department,
        role: p.role
      })),
      store: {
        people: store.people.filter(p => p.name === currentUser || p.department === activeDepartment).map(p => ({
          name: p.name,
          department: p.department,
          budget: p.budget
        }))
      }
    });
  }, [currentUser, activeDepartment, selectedPerson, activeUserContext, displayPeople, store.people]);

  // Handle switching back to Mhlengi Mntungwa
  const handleMhlengiMntungwaClick = async () => {
    // Log profile selection
    console.log('👤 Profile Selection:', {
      action: 'selecting Mhlengi Mntungwa',
      previous: {
        currentUser,
        activeUserContext,
        activeDepartment
      }
    });
    
    // Find Mhlengi's data
    const store = useBudgetStore.getState();
    const mhlengiUser = store.people.find(p => p.name === 'Mhlengi Mntungwa');
    
    if (!mhlengiUser) {
      console.error('Mhlengi Mntungwa not found in people array');
      return;
    }
    
    // Check if there's a pending request and create notification
    if (pendingRequest) {
      addNotification({
        requester: pendingRequest.requester,
        department: pendingRequest.department,
        amount: pendingRequest.amount
      });
      setPendingRequest(null); // Clear the pending request
    }
    
    // Reset all state to default values
    await Promise.all([
      // First, update the user context
      new Promise<void>(resolve => {
        setCurrentUser('Mhlengi Mntungwa');
        setActiveUserContext({
          name: 'Mhlengi Mntungwa',
          role: 'Budget Administrator',
          department: 'Budget Admin'
        });
        resolve();
      }),
      // Then, reset all view state
      new Promise<void>(resolve => {
        setActiveDepartment(null); // Reset to null to show only "All Departments"
        setDepartmentTotal(0);
        setSelectedPerson(null);
        setSelectedTeam(null);
        setSelectedTeamMember(null);
        resolve();
      })
    ]);
    
    // Clear UI state
    setSearchQuery('');
    setActiveMenu(null);
    
    // Log final state
    console.log('✅ Profile Switch Complete:', {
      currentUser: 'Mhlengi Mntungwa',
      context: {
        name: 'Mhlengi Mntungwa',
        role: 'Budget Administrator',
        department: 'Budget Admin'
      },
      department: null
    });
  };

  // Update the Morgan Freeman click handler
  const handleMorganFreemanClick = async () => {
    // Log profile selection
    console.log('👤 Profile Selection:', {
      action: 'selecting Morgan Freeman',
      previous: {
        currentUser,
        activeUserContext,
        activeDepartment
      }
    });
    
    // Find Morgan Freeman's data first
    const store = useBudgetStore.getState();
    const morganFreeman = store.people.find(p => p.name === 'Morgan Freeman');
    
    if (!morganFreeman) {
      console.error('Morgan Freeman not found in people array');
      return;
    }
    
    // Get Legal Services team structure from departmentTeams
    const legalServicesTeams = store.people
      .filter(p => p.department === 'Legal Services' && p.name !== 'Morgan Freeman')
      .map(person => {
        // Find this person's team in departmentTeams if it exists
        const teamData = departmentTeams['Legal Services']?.find(team => 
          team.members.some(m => m.name === person.name)
        );
        
        return {
          name: person.name,
          budget: person.budget,
          role: 'Budget User',
          department: 'Legal Services',
          // Include subordinates if they exist
          ...(teamData && {
            subordinates: teamData.members
              .find(m => m.name === person.name)?.subordinates || []
          })
        };
      });
    
    // Calculate department total
    const deptTotal = store.people
      .filter(p => p.department === 'Legal Services')
      .reduce((sum, p) => sum + p.budget, 0);

    // Create Morgan's team structure with proper hierarchy
    const morganWithTeams = {
      ...morganFreeman,
      role: 'Budget Manager',  // Explicitly set Morgan's role
      teams: [{
        name: 'Legal Services',
        members: legalServicesTeams
      }]
    };
    
    // Update all state in sequence using Promise.all to ensure atomicity
    await Promise.all([
      // First, update the user context
      new Promise<void>(resolve => {
        setCurrentUser('Morgan Freeman');
        setActiveUserContext({
          name: 'Morgan Freeman',
          role: 'Budget Manager',
          department: 'Legal Services'
        });
        resolve();
      }),
      // Then, update department context
      new Promise<void>(resolve => {
        setActiveDepartment('Legal Services'); // Always set to Legal Services
        setDepartmentTotal(deptTotal);
        resolve();
      }),
      // Finally, update selection context
      new Promise<void>(resolve => {
        setSelectedPerson(morganWithTeams);
        setSelectedTeam(null);
        setSelectedTeamMember(null);
        resolve();
      })
    ]);
    
    // Clear UI state
    setSearchQuery('');
    setActiveMenu(null);
    
    // Log final state
    console.log('✅ Profile Switch Complete:', {
      currentUser: 'Morgan Freeman',
      context: {
        name: 'Morgan Freeman',
        role: 'Budget Manager',
        department: 'Legal Services'
      },
      department: 'Legal Services',
      total: deptTotal,
      teamMembers: legalServicesTeams.length
    });
  };

  // Add effect to track profile switching
  useEffect(() => {
    if (currentUser === 'Morgan Freeman') {
      // Verify Morgan Freeman's context is properly set
      if (!activeUserContext || activeUserContext.name !== 'Morgan Freeman' || activeUserContext.role !== 'Budget Manager') {
        console.warn('⚠️ Morgan Freeman context not properly set');
        setActiveUserContext({
          name: 'Morgan Freeman',
          role: 'Budget Manager',
          department: 'Legal Services'
        });
      }
      
      // Verify department is set to Legal Services
      if (activeDepartment !== 'Legal Services') {
        console.warn('⚠️ Department not set to Legal Services');
        setActiveDepartment('Legal Services');
      }
      
      // Verify selected person is Morgan Freeman with correct role
      if (!selectedPerson || selectedPerson.name !== 'Morgan Freeman' || selectedPerson.role !== 'Budget Manager') {
        console.warn('⚠️ Selected person not set to Morgan Freeman');
        const store = useBudgetStore.getState();
        const morganFreeman = store.people.find(p => p.name === 'Morgan Freeman');
        if (morganFreeman) {
          setSelectedPerson({
            ...morganFreeman,
            role: 'Budget Manager',
            teams: [{
              name: 'Legal Services',
              members: store.people
                .filter(p => p.department === 'Legal Services' && p.name !== 'Morgan Freeman')
                .map(p => ({
                  name: p.name,
                  budget: p.budget,
                  role: 'Budget User'
                }))
            }]
          });
        }
      }
    }
  }, [currentUser, activeUserContext, activeDepartment, selectedPerson]);

  const handleRequestClick = () => {
    setShowRequestModal(true)
  }

  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')

  // Add this function to handle request approval
  const handleRequestApproval = async (requester: string, amount: number) => {
    // Set the approving state to trigger animation
    setApprovingRequest({
      personName: requester,
      amount: amount
    });

    // Allocate the budget after a short delay for animation
    setTimeout(() => {
      allocateBudget(amount, requester, false);
      setApprovingRequest(null);
    }, 1000);
  };

  // Add new function to calculate department allocation
  const calculateDepartmentAllocation = (departmentId: string, headcount: number) => {
    const deptPeople = people.filter(p => p.department === departmentId);
    const basePoints = Number(automationForm.basePointsPerPerson) || 0;
    const baseAllocation = basePoints * headcount;
    const exceptions = departmentExceptions.filter(e => e.departmentId === departmentId);
    const totalExceptions = exceptions.reduce((sum, e) => sum + e.points, 0);
    
    return baseAllocation + totalExceptions;
  }

  // Add a helper function to safely convert string to number
  const safeNumberConversion = (value: string): number => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  // Add a helper function for safe calculations
  const calculateAllocation = (basePoints: string, headcount: number): number => {
    const points = Number(basePoints);
    return isNaN(points) ? 0 : points * headcount;
  }

  const handleCloseAllocationModal = () => {
    setShowAllocationModal(false);
    setAutomationForm({
      name: '',
      basePointsPerPerson: '',
      schedule: 'monthly',
      isActive: true,
      cadenceType: 'fixed'
    });
    setAllocationPreview(null);
  };

  // Sample data for the new table
  const sampleSpendingData = {
    "Andrea Bocelli": [50000, 60000, 55000, 48000, 70000, 65000, 52000, 58000, 62000, 59000, 68000, 58000],
    "Yo-Yo Ma": [45000, 42000, 50000, 53000, 58000, 49000, 55000, 60000, 56000, 48000, 52000, 54000],
    "Lang Lang": [38000, 42000, 45000, 40000, 52000, 48000, 44000, 50000, 47000, 43000, 46000, 41000],
    "Joshua Bell": [32000, 35000, 30000, 38000, 42000, 36000, 39000, 41000, 37000, 34000, 40000, 43000],
    "Diana Krall": [48000, 52000, 50000, 55000, 59000, 54000, 51000, 57000, 53000, 49000, 56000, 60000]
  };

  const sampleBudgets = {
    "Andrea Bocelli": 800000,
    "Yo-Yo Ma": 700000,
    "Lang Lang": 600000,
    "Joshua Bell": 500000,
    "Diana Krall": 750000
  };

  const getPersonDataByName = (name: string) => {
    return people.find(p => p.name === name);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F5F5F5]">
      <div className="container h-full mx-auto py-6">
        <div className="h-full max-w-[980px] mx-auto">
          <div className="bg-background rounded-2xl shadow-sm h-full flex flex-col overflow-hidden">
            <div className="p-6 space-y-6">
              <div className={`flex items-center justify-between ${ // Simplified visibility logic for top budget display
                currentUser === 'Mhlengi Mntungwa' && !(activeDepartment || selectedPerson)
                  ? 'mb-6' 
                  : 'hidden'
              }`}>
                <div className="border border-[#E5E7EB] rounded-xl flex items-center">
                  <div className="px-4 py-2 border-r border-[#E5E7EB]">
                    <Wallet className="h-6 w-6 text-muted stroke-2" />
                  </div>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <Medal className="h-5 w-5 text-[#F59E0B]" />
                    <span className="text-gray-900 text-lg">
                      {(people.find(p => p.name === 'Mhlengi Mntungwa')?.budget || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* User Profile and Notifications - Moved Up */}
              <div className="flex items-center justify-between mb-6">
                {/* Placeholder for potential future left-side elements */}
                <div></div> 
                <div className="flex items-center gap-3">
                  <NotificationButton onApprove={handleRequestApproval} currentUser={currentUser} />
                </div>
              </div>

              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 group">
                {/* Always show Mhlengi's details if they are the current user */}
                <div className="text-gray-500 text-sm mb-1">
                  {currentUser === 'Mhlengi Mntungwa' 
                    ? 'Me' 
                    : selectedPerson?.role || (activeDepartment ? 'Budget Manager' : 'Me')}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700">
                      {currentUser === 'Mhlengi Mntungwa' ? currentUser : selectedPerson?.name || currentUser}
                    </span>
                    {/* Only show department if not Mhlengi */}
                    {currentUser !== 'Mhlengi Mntungwa' && (
                      <span className="text-gray-400 text-sm">
                        {/* Add null check for selectedPerson before accessing department */}
                        {selectedPerson ? `/ ${selectedPerson.department}` : 
                         activeDepartment ? `/ ${activeDepartment}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center">
                    <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center">
                      <div className="px-4 py-2 border-r border-[#E5E7EB]">
                        <Wallet className="h-6 w-6 text-muted stroke-2" />
                      </div>
                      <div className="px-4 py-2 flex items-center gap-2">
                        <Medal className="h-5 w-5 text-[#F59E0B]" />
                        <span className="text-gray-900">
                          {/* Show Mhlengi's budget if current user, otherwise selected person or current user budget */}
                          {(currentUser === 'Mhlengi Mntungwa' 
                            ? budgetAdminBudget 
                            /* Add null check for selectedPerson before accessing budget */
                            : selectedPerson ? selectedPerson.budget : getCurrentUserBudget()
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab Menu - Moved here above buttons */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                      mainViewTab === 'allocation'
                        ? 'border-accent text-accent'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setMainViewTab('allocation')}
                  >
                    Allocation
                  </button>
                  <button
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                      mainViewTab === 'insights'
                        ? 'border-accent text-accent'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setMainViewTab('insights')}
                  >
                    Insights
                  </button>
                </nav>
              </div>

              {/* Combined Breadcrumbs and Buttons Container */}
              <div className="pt-4">
                {/* Buttons - Now first */}
                <div className="flex items-center gap-3">
                  {/* ... Allocate/Request/Add Member Buttons ... */}
                   <Button 
                    className="flex-1 bg-accent hover:bg-accent/90 text-white font-medium h-11"
                    onClick={() => setShowAllocationModal(true)}
                  >
                    <BanknotesIcon className="h-4 w-4 mr-2" />
                    Allocate
                  </Button>
                  {currentUser === 'Morgan Freeman' && (
                    <Button
                      variant="outline"
                      className="flex-1 font-medium h-11"
                      onClick={handleRequestClick}
                    >
                      {/* ... Request Icon ... */}
                       <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="mr-2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Request
                    </Button>
                  )}
                  <Button 
                    variant="outline"
                    className="flex-1 font-medium h-11"
                    onClick={handleAddMemberClick}
                  >
                    {/* ... Add Member Icon ... */}
                     <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      className="mr-2"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                    Add Member
                  </Button>
                </div>
                
                {/* Breadcrumbs - Now below buttons */}
                <div className="mt-4">
                  <Breadcrumbs items={breadcrumbItems} />
                </div>
              </div>
            </div>

            {/* Conditional Content based on Tab */}
            {mainViewTab === 'allocation' && (
              <div className="flex-1 overflow-y-auto min-h-0 p-6 pt-0">
                {/* Remove Breadcrumbs from here as they've been moved up */}
                
                <div className="relative mt-4"> {/* Added margin-top */}
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted stroke-2" />
                  <Input
                    className="pl-9 h-10"
                    placeholder={/* ... Placeholder logic ... */
                       currentUser === 'Morgan Freeman'
                        ? "Search Legal Services members..."
                        : organizationType === 'decentralized' && !activeUnit
                          ? "Search units..."
                          : "Search people or departments..."
                    }
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* List Section */}
                <div className="space-y-2 border border-[#E5E7EB] rounded-xl p-2 mt-4"> {/* Added margin-top */}
                  {displayPeople.map((person) => (
                    <div 
                      key={person.id} 
                      className="group px-4 py-3 hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
                      onClick={() => {
                        if (organizationType === 'decentralized' && person.role === 'Unit') {
                          // Handle unit click
                          handleUnitSelect(person.name);
                        } else if (!selectedPerson && person.role !== 'Unit') {
                          // Handle person click (cast needed here)
                          handlePersonClick(person as Person & { role: 'Budget Manager' | 'Budget User' })
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 gap-4 transition-all duration-300" style={{ gap: editingPerson === person.name ? '0px' : '1rem' }}>
                          <div className="flex items-center w-[500px]">
                            <div className="flex items-center min-w-0 flex-1">
                              {/* Display Logic: Unit vs Person */}
                              {person.role === 'Unit' ? (
                                <>
                                  <span className="text-base truncate">{person.department}</span> {/* Location */}
                                  <span className="mx-[2px] text-gray-400 flex-shrink-0">/</span>
                                  <span className="text-gray-400 text-sm truncate">{person.budgetManager}</span> {/* Budget Manager Name */}
                                </>
                              ) : (
                                <>
                                  <span className="text-base truncate">{person.name}</span>
                                  <span className="mx-[2px] text-gray-400 flex-shrink-0">/</span>
                                  <span className="text-gray-400 text-sm truncate">{person.department}</span>
                                </>
                              )}
                            </div>
                            <div className="flex-shrink-0">
                              <Badge variant="department" className="flex items-center justify-center w-[160px] px-2 transition-all duration-300">
                                <span className="whitespace-nowrap">
                                  {person.role === 'Unit' 
                                    ? 'Budget Admin' // Unit role is now Budget Admin
                                    : currentUser === 'Morgan Freeman' 
                                      ? 'Budget User' 
                                      : person.role || 'Budget User'
                                  }
                                </span>
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end min-w-[220px]">
                          {/* Conditional Rendering: Units vs People/Departments */}
                          {person.role === 'Unit' ? (
                            // === Unit Display (using Person controls structure) ===
                            <div className="flex items-center justify-end gap-0 group/wallet w-full relative">
                              {/* Replicate Default Budget Display section from Person rows */}
                              <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center cursor-pointer ml-auto">
                                <div className="px-4 py-2 border-r border-[#E5E7EB]"><Wallet className="h-6 w-6 text-muted stroke-2" /></div>
                                <div className="px-4 py-2 flex items-center gap-2 min-w-[120px] w-full sm:min-w-[160px]">
                                  <Medal className="h-5 w-5 text-[#F59E0B]" />
                                  <span className="text-gray-900">{0}</span> {/* Points for Unit, default to 0 */}
                                </div>
                                {/* Allocate Button - Disabled for Units */}
                                <button 
                                  className="px-4 py-2 border-l border-[#E5E7EB] transition-colors group cursor-not-allowed" 
                                  disabled
                                  onClick={(e) => e.stopPropagation()} // Prevent clicks
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="h-5 w-5 text-gray-300"> {/* Grayed out icon */}
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"></path>
                                  </svg>
                                </button>
                              </div>
                              {/* Menu Button - Disabled for Units */}
                              <div className="relative ml-2">
                                <button 
                                  className="p-2 rounded-lg transition-colors cursor-not-allowed" 
                                  disabled
                                  onClick={(e) => e.stopPropagation()} // Prevent clicks
                                >
                                  <MoreVertical className="h-5 w-5 text-gray-300" /> {/* Grayed out icon */}
                                </button>
                              </div>
                            </div>
                          ) : (
                            // === Person/Department Display ===
                            <>
                              {editingPerson === person.name ? (
                                // Inline Edit Form
                                <div className="relative flex-1">
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const amount = Number(inlineInputValue)
                                      if (!isNaN(amount)) {
                                        setSavingPerson(person.name)
                                        setSavedAmount(amount)
                                        allocateBudget(amount, person.name, transferMode === 'reclaim')
                                        setTimeout(() => {
                                          setSavingPerson(null)
                                          setSavedAmount(null)
                                          setEditingPerson(null)
                                          setInlineInputValue('')
                                          setShowAllocationInput(false)
                                          setShowTransferMenu(false)
                                        }, 800)
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full"
                                  >
                                    {/* ... Form content remains the same ... */}
                                    <div className="relative group">
                                      <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center h-[42px]">
                                        <div className="px-4 flex items-center border-r border-[#E5E7EB]">
                                            <button
                                              type="button"
                                              className="w-8 h-8 bg-blue-50 rounded-[4px] flex items-center justify-center border-2 border-blue-200 hover:bg-accent hover:border-accent"
                                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTransferMenu(!showTransferMenu); }}
                                            >
                                              {transferMode === 'give' ? (
                                                <BanknotesIcon className="h-5 w-5 text-accent hover:text-white" />
                                              ) : (
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-accent hover:text-white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                  <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
                                                </svg>
                                              )}
                                            </button>
                                          </div>
                                          <input 
                                            type="text" 
                                            value={inlineInputValue}
                                            onChange={(e) => setInlineInputValue(e.target.value)}
                                            className="w-full px-4 py-2 outline-none border-none bg-transparent focus:ring-0"
                                            placeholder="0"
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <button type="submit" className="px-4 py-2 border-l border-[#E5E7EB] text-accent">Send</button>
                                        </div>
                                        {showTransferMenu && (
                                          <div className="absolute right-0 top-[calc(100%+4px)] border rounded-lg shadow-md bg-white z-10">
                                            <div className="p-2">
                                              <button type="button" className={`flex items-center gap-2 px-3 py-2 rounded-md w-full text-left ${transferMode === 'give' ? 'bg-blue-50 text-accent' : 'hover:bg-gray-50'}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTransferMode('give'); setShowTransferMenu(false); }}>
                                                <BanknotesIcon className={`h-4 w-4 ${transferMode === 'give' ? 'text-accent' : 'text-gray-400'}`} /><span>Give</span>
                                              </button>
                                              <button type="button" className={`flex items-center gap-2 px-3 py-2 rounded-md w-full text-left ${transferMode === 'reclaim' ? 'bg-blue-50 text-accent' : 'hover:bg-gray-50'}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTransferMode('reclaim'); setShowTransferMenu(false); }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`${transferMode === 'reclaim' ? 'text-accent' : 'text-gray-400'}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                  <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
                                                </svg><span>Reclaim</span>
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                  </form>
                                </div>
                              ) : (
                                // Static Budget Display
                                <div className="flex items-center justify-end gap-0 group/wallet w-full relative">
                                  {savingPerson === person.name ? (
                                    // Saving Animation
                                    <div className="flex items-center">
                                      <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center transition-all">
                                        <div className="px-4 py-2 border-r border-[#E5E7EB] ">
                                          {transferMode === 'give' ? (
                                            <ArrowUpCircle className="h-5 w-5 text-[#10B981] animate-pulse" />
                                          ) : (
                                            <ArrowDownCircle className="h-5 w-5 text-[#EF4444] animate-pulse" />
                                          )}
                                        </div>
                                        <div className="px-4 py-2 flex items-center gap-2 min-w-[120px] w-full sm:min-w-[160px]">
                                          <Medal className="h-5 w-5 text-[#F59E0B]" />
                                          <span className="text-gray-900 animate-pulse">{savedAmount?.toLocaleString()}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    // Default Budget Display
                                    <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center cursor-pointer ml-auto">
                                      <div className="px-4 py-2 border-r border-[#E5E7EB]"><Wallet className="h-6 w-6 text-muted stroke-2" /></div>
                                      <div className="px-4 py-2 flex items-center gap-2 min-w-[120px] w-full sm:min-w-[160px]">
                                        <Medal className="h-5 w-5 text-[#F59E0B]" /><span className="text-gray-900">{person.budget.toLocaleString()}</span>
                                      </div>
                                      <button className="px-4 py-2 border-l border-[#E5E7EB] hover:bg-blue-50 transition-colors group" onClick={(e) => { e.stopPropagation(); setEditingPerson(person.name); setInlineInputValue(''); setShowAllocationInput(true); setTransferMode('give'); }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" className="h-5 w-5 text-gray-400 group-hover:text-accent transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"></path></svg>
                                      </button>
                                    </div>
                                  )}
                                  <div className="relative ml-2">
                                    <button className="p-2 rounded-lg transition-colors hover:bg-gray-100" onClick={(e) => { e.stopPropagation(); handleMenuClick(person); }}>
                                      <MoreVertical className="h-5 w-5 text-gray-400 hover:text-accent transition-colors" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mainViewTab === 'insights' && (
              <div className="flex-1 overflow-y-auto min-h-0 p-6">
                {/* Monthly Spending Table */}
                <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
                  <div className="bg-[#F9FAFB] p-4 border-b border-[#E5E7EB]">
                    <h3 className="font-medium text-gray-900">Monthly Spending Overview</h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max">
                      <thead>
                        <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                          <th className="py-3 px-4 text-left font-medium text-gray-500 text-sm sticky left-0 bg-[#F9FAFB]">User</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Jan</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Feb</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Mar</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Apr</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">May</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Jun</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Jul</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Aug</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Sep</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Oct</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Nov</th>
                          <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Dec</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Monthly spending data table rows */}
                        {(() => {
                          // Sample data for monthly spending
                          const monthlySpendingData = {
                            "Andrea Bocelli": [50000, 60000, 55000, 48000, 70000, 65000, 52000, 58000, 62000, 59000, 68000, 72000],
                            "Yo-Yo Ma": [45000, 42000, 50000, 53000, 58000, 49000, 55000, 60000, 56000, 48000, 52000, 57000],
                            "Lang Lang": [38000, 42000, 45000, 40000, 52000, 48000, 44000, 50000, 47000, 43000, 46000, 51000],
                            "Joshua Bell": [32000, 35000, 30000, 38000, 42000, 36000, 39000, 41000, 37000, 34000, 40000, 43000],
                            "Diana Krall": [48000, 52000, 50000, 55000, 59000, 54000, 51000, 57000, 53000, 49000, 56000, 60000]
                          };
                          
                          // Map data to table rows
                          return Object.entries(monthlySpendingData).map(([name, spending]) => (
                            <tr key={name} className="border-b border-[#E5E7EB] hover:bg-[#F3F4F6]">
                              <td className="py-3 px-4 font-medium text-gray-900 sticky left-0 bg-white">{name}</td>
                              {spending.map((amount, index) => (
                                <td key={index} className="py-3 px-4 text-right text-gray-700">
                                  {amount.toLocaleString()}
                                </td>
                              ))}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* New Spending Table Section */}
                <div className="pt-6 border-t mt-6">
                   <h3 className="text-sm font-medium text-gray-700 mb-4">Spending vs Budget (December)</h3>
                   <div className="border rounded-xl overflow-hidden">
                     <div className="overflow-x-auto">
                       <table className="w-full min-w-max">
                         <thead>
                           <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                             <th className="py-3 px-4 text-left font-medium text-gray-500 text-sm w-1/2">User</th>
                             <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">December Spending</th>
                             <th className="py-3 px-4 text-right font-medium text-gray-500 text-sm">Delta</th>
                           </tr>
                         </thead>
                         <tbody>
                           {Object.entries(sampleSpendingData).map(([name, spending]) => {
                             const budget = sampleBudgets[name as keyof typeof sampleBudgets] || 0;
                             const decSpending = spending[11]; // December is the 12th month (index 11)
                             const delta = decSpending - budget;
                             const personData = getPersonDataByName(name);

                             return (
                               <tr key={name} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F3F4F6]">
                                 <td className="py-3 px-4">
                                   {/* Replicate user display from main list */}
                                   <div className="flex items-center gap-2">
                                     <div className="flex-1 min-w-0">
                                        <div className="flex items-center">
                                          <span className="text-base truncate font-medium text-gray-900">{name}</span>
                                          {personData && (
                                            <>
                                            <span className="mx-[2px] text-gray-400 flex-shrink-0">/</span>
                                            <span className="text-gray-400 text-sm truncate">{personData.department}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center flex-shrink-0">
                                         <div className="bg-white border border-[#E5E7EB] rounded-xl flex items-center">
                                           <div className="px-2 py-1 border-r border-[#E5E7EB]"><Wallet className="h-5 w-5 text-muted stroke-2" /></div>
                                           <div className="px-2 py-1 flex items-center gap-1 min-w-[80px]">
                                             <Medal className="h-4 w-4 text-[#F59E0B]" />
                                             <span className="text-gray-900 text-sm">{budget.toLocaleString()}</span>
                                           </div>
                                         </div>
                                      </div>
                                   </div>
                                 </td>
                                 <td className="py-3 px-4 text-right text-gray-700">
                                   {decSpending.toLocaleString()}
                                 </td>
                                 <td className="py-3 px-4 text-right">
                                   <div className={`flex items-center justify-end gap-1 ${delta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                     {delta < 0 ? (
                                       <ArrowDown className="h-4 w-4" />
                                     ) : (
                                       <ArrowUp className="h-4 w-4" />
                                     )}
                                     <span className="font-medium">{Math.abs(delta).toLocaleString()}</span>
                                   </div>
                                 </td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 </div>
                {/* End New Spending Table Section */}

                <div className="p-6 pt-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className={`bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl py-2 px-4 transition-all duration-300 flex-1`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-sm">Total Reward Points</span>
                        <span className="text-gray-900">
                          {calculateTotalPoints().toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className={`flex space-x-3 transition-all duration-300 ${showAllocationInput ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none'}`}>
                      <Button 
                        variant="outline" 
                        className="px-8 h-11 text-base font-medium"
                        onClick={() => {
                          setInputValue('')
                          setShowAllocationInput(false)
                          setEditingPerson(null)
                          setInlineInputValue('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        className="px-8 h-11 text-base font-medium bg-accent hover:bg-accent/90"
                        onClick={() => {
                          const amount = Number(inlineInputValue)
                          if (!isNaN(amount) && editingPerson) {
                            setSavingPerson(editingPerson)
                            setSavedAmount(amount)
                            allocateBudget(amount, editingPerson, transferMode === 'reclaim')
                            setTimeout(() => {
                              setSavingPerson(null)
                              setSavedAmount(null)
                              setEditingPerson(null)
                              setInlineInputValue('')
                              setShowAllocationInput(false)
                            }, 1000)
                          }
                        }}
                        disabled={!inlineInputValue || !editingPerson}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div 
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
          showAllocationModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 50 }}
      >
        <div 
          className="absolute inset-0 bg-black/20 transition-opacity"
          onClick={() => setShowAllocationModal(false)}
        />
        
        <div 
          className={`relative w-full bg-white rounded-2xl shadow-xl transform transition-transform duration-300 ease-out mx-4 md:mx-6 ${
            showAllocationModal ? 'translate-y-0 scale-100' : '-translate-y-4 scale-95'
          }`}
          style={{ maxWidth: 'calc(1470px - 4.5rem)' }} // Increased width by 1.5x
        >
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Allocate Points</h2>
                <div className="mt-4 border-b border-gray-200">
                  <div className="flex gap-4">
                    <button
                      className={`pb-4 px-1 ${
                        activeTab === 'manual'
                          ? 'border-b-2 border-accent text-accent font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setActiveTab('manual')}
                    >
                      Manual Allocation
                    </button>
                    <button
                      className={`pb-4 px-1 ${
                        activeTab === 'automation'
                          ? 'border-b-2 border-accent text-accent font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setActiveTab('automation')}
                    >
                      Batch
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={handleCloseAllocationModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {activeTab === 'manual' ? (
              // Existing manual allocation content
              <div className="space-y-6">
                <div className="bg-[#F9FAFB] rounded-xl p-4">
                  <div className="text-sm text-gray-500 mb-1">Allocator</div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Mhlengi Mntungwa</span>
                    <div className="flex items-center gap-2">
                      <Medal className="h-5 w-5 text-[#F59E0B]" />
                      <span className="text-gray-900">{(people.find(p => p.name === 'Mhlengi Mntungwa')?.budget || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center -my-3 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border-2 border-blue-100">
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      className="text-blue-500"
                    >
                      <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                <div className="bg-[#F9FAFB] rounded-xl p-4">
                  <div className="text-sm text-gray-500 mb-1">Recipient</div>
                  <div className="relative">
                    {selectedPerson ? (
                      <div 
                        className="relative cursor-pointer group"
                        onClick={() => {
                          setSelectedPerson(null)
                          setRecipientSearchQuery('')
                          setShowRecipientSearch(true)
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{selectedPerson.name}</span>
                            <span className="text-gray-400 text-sm">/ {selectedPerson.department}</span>
                            <span className="text-sm text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              Change
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Medal className="h-5 w-5 text-[#F59E0B]" />
                            <span className="text-gray-900">{selectedPerson.budget.toLocaleString()}</span>
                          </div>
                        </div>
                        
                        {showSelectionSuccess && (
                          <div className="absolute inset-0 bg-green-50 rounded-lg flex items-center justify-center transition-opacity duration-300">
                            <Check className="h-5 w-5 text-green-500 animate-check" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative recipient-search">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted stroke-2" />
                          <Input
                            placeholder="Search user or department..."
                            className="pl-9 h-11"
                            value={recipientSearchQuery}
                            onChange={(e) => {
                              setRecipientSearchQuery(e.target.value)
                              setShowRecipientSearch(true)
                            }}
                            onFocus={() => setShowRecipientSearch(true)}
                          />
                        </div>
                        
                        {showRecipientSearch && filteredRecipients.length > 0 && (
                          <div className="absolute w-full mt-2 bg-white rounded-xl border border-[#E5E7EB] shadow-lg overflow-hidden z-20">
                            <div className="max-h-[240px] overflow-y-auto">
                              {filteredRecipients.map((person) => (
                                <div
                                  key={person.name}
                                  className="px-4 py-3 hover:bg-[#F3F4F6] cursor-pointer flex items-center justify-between transition-colors"
                                  onClick={() => {
                                    setSelectedPerson(person)
                                    setRecipientSearchQuery('')
                                    setShowRecipientSearch(false)
                                    setShowSelectionSuccess(true)
                                    setTimeout(() => {
                                      setShowSelectionSuccess(false)
                                      if (amountInputRef.current) {
                                        amountInputRef.current.focus()
                                      }
                                    }, 1000)
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{person.name}</span>
                                    <span className="text-gray-400 text-sm">/ {person.department}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Medal className="h-5 w-5 text-[#F59E0B]" />
                                    <span className="text-gray-900">{person.budget.toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Input
                    ref={amountInputRef}
                    type="number"
                    placeholder="Enter amount to allocate"
                    className={`h-11 text-lg transition-all duration-300 ${!selectedPerson ? 'opacity-50' : 'opacity-100'}`}
                    value={inlineInputValue}
                    onChange={(e) => setInlineInputValue(e.target.value)}
                    disabled={!selectedPerson}
                  />
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={willAllocateBudget}
                      onChange={(e) => {
                        setWillAllocateBudget(e.target.checked)
                        if (!e.target.checked) {
                          setNewMember(prev => ({ ...prev, initialBudget: 0 }))
                        }
                      }}
                      className="w-4 h-4 rounded border-[#E5E7EB] text-accent focus:ring-accent/20 transition-colors"
                    />
                    <span className="text-sm text-gray-600 group-hover:text-gray-900">
                      Set initial budget allocation
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={handleCloseAllocationModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-accent hover:bg-accent/90 text-white h-11"
                    onClick={() => {
                      const amount = Number(inlineInputValue)
                      if (!isNaN(amount) && selectedPerson) {
                        // Show saving animation
                        setSavingPerson(selectedPerson.name)
                        setSavedAmount(amount)
                        
                        // Delay the actual allocation to show transition
                        setTimeout(() => {
                          allocateBudget(amount, selectedPerson.name, false)
                          
                          // Show success animation
                          setShowSelectionSuccess(true)
                          setTimeout(() => {
                            setShowSelectionSuccess(false)
                            setSavingPerson(null)
                            setSavedAmount(null)
                            setInlineInputValue('')
                            setShowAllocationModal(false)
                            setSelectedPerson(null)
                          }, 1500)
                        }, 500)
                      }
                    }}
                    disabled={!inlineInputValue || !selectedPerson || isNaN(Number(inlineInputValue)) || Number(inlineInputValue) <= 0}
                  >
                    <BanknotesIcon className="h-4 w-4 mr-2" />
                    Allocate
                  </Button>
                </div>
              </div>
            ) : (
              // New automation tab content
              <div className="space-y-6">
                {/* Saved Batches Section */}
                {automationRules.length > 0 && (
                  <div className="border rounded-xl overflow-hidden mb-6">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h3 className="font-medium">Saved Batches</h3>
                    </div>
                    <div className="divide-y">
                      {automationRules.map((rule) => (
                        <div 
                          key={rule.id} 
                          className="p-4 hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            setAutomationForm({
                              name: rule.name,
                              basePointsPerPerson: rule.basePointsPerPerson.toString(),
                              schedule: rule.schedule,
                              isActive: rule.isActive,
                              cadenceType: rule.cadenceType
                            });
                            
                            // Update preview
                            const value = rule.basePointsPerPerson.toString();
                            const totalAllocation = existingDepartments.reduce((total, dept) => {
                              const headcount = people.filter(p => p.department === dept).length;
                              return total + calculateAllocation(value, headcount);
                            }, 0);
                            
                            setAllocationPreview({
                              total: totalAllocation,
                              departments: existingDepartments.map(dept => {
                                const deptPeople = people.filter(p => p.department === dept);
                                const headcount = deptPeople.length;
                                const baseAllocation = calculateAllocation(value, headcount);
                                const exceptions = departmentExceptions.filter(e => e.departmentId === dept);
                                const totalExceptions = exceptions.reduce((sum, e) => sum + (e.points || 0), 0);
                                const points = Number(value);
                                
                                return {
                                  name: dept,
                                  headcount,
                                  allocation: baseAllocation + totalExceptions,
                                  people: deptPeople.map(p => ({
                                    id: p.id,
                                    name: p.name,
                                    basePoints: points,
                                    extraPoints: exceptions.find(e => e.userId === p.id)?.points || 0,
                                    totalPoints: points + (exceptions.find(e => e.userId === p.id)?.points || 0)
                                  }))
                                };
                              })
                            });
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{rule.name}</div>
                              <div className="text-sm text-gray-500">
                                {rule.basePointsPerPerson} points per person
                                {rule.cadenceType === 'rolling' && ` • ${rule.schedule}`}
                              </div>
                            </div>
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAutomationRule(rule.id);
                              }}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Batch Form */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    Batch Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Enter batch name"
                    className="h-11 text-lg mb-4"
                    value={automationForm.name}
                    onChange={(e) => {
                      setAutomationForm(prev => ({
                        ...prev,
                        name: e.target.value
                      }));
                    }}
                  />

                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    Base Points per Person
                  </label>
                  <Input
                    type="number"
                    placeholder="Enter base points"
                    className="h-11 text-lg"
                    value={automationForm.basePointsPerPerson}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAutomationForm(prev => ({
                        ...prev,
                        basePointsPerPerson: value
                      }));
                      
                      // Update preview whenever base points change
                      if (value === '') {
                        setAllocationPreview(null);
                      } else {
                        const totalAllocation = existingDepartments.reduce((total, dept) => {
                          const headcount = people.filter(p => p.department === dept).length;
                          return total + calculateAllocation(value, headcount);
                        }, 0);
                        
                        setAllocationPreview({
                          total: totalAllocation,
                          departments: existingDepartments.map(dept => {
                            const deptPeople = people.filter(p => p.department === dept);
                            const headcount = deptPeople.length;
                            const baseAllocation = calculateAllocation(value, headcount);
                            const exceptions = departmentExceptions.filter(e => e.departmentId === dept);
                            const totalExceptions = exceptions.reduce((sum, e) => sum + (e.points || 0), 0);
                            const points = Number(value);
                            
                            return {
                              name: dept,
                              headcount,
                              allocation: baseAllocation + totalExceptions,
                              people: deptPeople.map(p => ({
                                id: p.id,
                                name: p.name,
                                basePoints: points,
                                extraPoints: exceptions.find(e => e.userId === p.id)?.points || 0,
                                totalPoints: points + (exceptions.find(e => e.userId === p.id)?.points || 0)
                              }))
                            };
                          })
                        });
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer group mb-4">
                    <input
                      type="checkbox"
                      checked={automationForm.cadenceType === 'rolling'}
                      onChange={(e) => setAutomationForm(prev => ({
                        ...prev,
                        cadenceType: e.target.checked ? 'rolling' : 'fixed'
                      }))}
                      className="w-4 h-4 rounded border-[#E5E7EB] text-accent focus:ring-accent/20 transition-colors"
                    />
                    <span className="text-sm text-gray-600 group-hover:text-gray-900">
                      Rolling allocation
                    </span>
                  </label>

                  {automationForm.cadenceType === 'rolling' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1.5">
                        Schedule
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['monthly', 'quarterly', 'yearly'] as const).map((schedule) => (
                          <label
                            key={schedule}
                            className={`flex items-center justify-center p-4 border rounded-xl cursor-pointer transition-colors ${
                              automationForm.schedule === schedule
                                ? 'bg-blue-50 border-blue-200'
                                : 'hover:bg-gray-50 border-[#E5E7EB]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="schedule"
                              value={schedule}
                              checked={automationForm.schedule === schedule}
                              onChange={(e) => setAutomationForm(prev => ({
                                ...prev,
                                schedule: e.target.value as typeof prev.schedule
                              }))}
                              className="sr-only"
                            />
                            <span className={`capitalize ${
                              automationForm.schedule === schedule
                                ? 'text-blue-600'
                                : 'text-gray-700'
                            }`}>
                              {schedule}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Section - Always visible */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">Allocation Preview</h3>
                  </div>

                  {allocationPreview && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                        <span className="text-sm font-medium text-blue-700">Total Points to Allocate</span>
                        <span className="text-lg font-semibold text-blue-700">
                          {allocationPreview.total.toLocaleString()}
                        </span>
                      </div>

                      <div className="border rounded-xl overflow-hidden">
                        <div className="max-h-[300px] overflow-y-auto">
                          {allocationPreview.departments.map(dept => (
                            <div key={dept.name} className="border-b last:border-0">
                              <div className="flex items-center justify-between p-4 bg-gray-50">
                                <div>
                                  <div className="font-medium">{dept.name}</div>
                                  <div className="text-sm text-gray-500">{dept.headcount} people</div>
                                </div>
                                <div className="font-medium">{dept.allocation.toLocaleString()} points</div>
                              </div>
                              <div className="divide-y">
                                {dept.people.map(person => (
                                  <div key={person.id} className="flex items-center justify-between p-4 pl-8">
                                    <div className="flex items-center gap-2">
                                      <span>{person.name}</span>
                                      {person.extraPoints !== 0 && (
                                        <span className={`text-sm ${person.extraPoints > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          ({person.extraPoints > 0 ? '+' : ''}{person.extraPoints})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-gray-900">{person.totalPoints.toLocaleString()} points</span>
                                      <button
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                        onClick={() => {
                                          setCurrentException({
                                            departmentId: dept.name,
                                            userId: person.id,
                                            points: person.extraPoints,
                                          });
                                          setShowExceptionForm(true);
                                        }}
                                      >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={handleCloseAllocationModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-accent hover:bg-accent/90 text-white h-11"
                    onClick={() => {
                      const points = Number(automationForm.basePointsPerPerson);
                      if (!isNaN(points) && points > 0 && automationForm.name) {
                        addAutomationRule({
                          name: automationForm.name,
                          basePointsPerPerson: points,
                          schedule: automationForm.schedule,
                          isActive: automationForm.isActive,
                          nextRunDate: new Date(),
                          lastRunDate: null,
                          cadenceType: automationForm.cadenceType,
                          fixedDates: []
                        });
                        setShowAllocationModal(false);
                      }
                    }}
                    disabled={!automationForm.name || !automationForm.basePointsPerPerson || Number(automationForm.basePointsPerPerson) <= 0}
                  >
                    Save Rule
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11"
                    onClick={() => {
                      if (allocationPreview) {
                        // Calculate total allocation amount
                        const totalAllocation = allocationPreview.departments.reduce((total, dept) => {
                          return total + dept.allocation;
                        }, 0);

                        // First deduct from Mhlengi Mntungwa
                        allocateBudget(totalAllocation, 'Mhlengi Mntungwa', true);

                        // Then allocate to each person
                        allocationPreview.departments.forEach(dept => {
                          dept.people.forEach(person => {
                            if (person.totalPoints > 0) {
                              allocateBudget(person.totalPoints, person.name, false);
                            }
                          });
                        });
                        
                        setShowAllocationModal(false);
                      }
                    }}
                    disabled={!allocationPreview || !automationForm.basePointsPerPerson || Number(automationForm.basePointsPerPerson) <= 0}
                  >
                    Send Now
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Exception Modal */}
      {showExceptionForm && (
        <div className="fixed inset-0 flex items-center justify-center z-[200]">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowExceptionForm(false)
              setCurrentException(null)
            }}
          />
          <div className="relative w-full max-w-[640px] bg-white rounded-2xl shadow-xl mx-4 md:mx-6">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-semibold">Department Exceptions</h3>
                <button
                  onClick={() => {
                    setShowExceptionForm(false)
                    setCurrentException(null)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {currentException ? (
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      Point Adjustment
                    </label>
                    <Input
                      type="number"
                      placeholder="Enter point adjustment (can be negative)"
                      className="h-11"
                      value={currentException.points}
                      onChange={(e) => setCurrentException((prev: DepartmentException | null) => prev ? ({
                        ...prev,
                        points: Number(e.target.value)
                      }) : null)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      Reason (Optional)
                    </label>
                    <Input
                      type="text"
                      placeholder="Enter reason for adjustment"
                      className="h-11"
                      value={currentException.reason || ''}
                      onChange={(e) => setCurrentException((prev: DepartmentException | null) => prev ? ({
                        ...prev,
                        reason: e.target.value
                      }) : null)}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-8 mt-4 border-t">
                    <Button
                      variant="outline"
                      className="flex-1 h-11"
                      onClick={() => {
                        if (currentException.departmentId && currentException.userId) {
                          removeDepartmentException(currentException.departmentId)
                        }
                        setCurrentException(null)
                        setShowExceptionForm(false)
                      }}
                    >
                      Remove Exception
                    </Button>
                    <Button
                      className="flex-1 bg-accent hover:bg-accent/90 text-white h-11"
                      onClick={() => {
                        if (currentException) {
                          const { departmentId, ...updates } = currentException
                          if (departmentExceptions.some(e => 
                            e.departmentId === departmentId && 
                            e.userId === currentException.userId
                          )) {
                            updateDepartmentException(departmentId, updates)
                          } else {
                            addDepartmentException(currentException)
                          }
                        }
                        setCurrentException(null)
                        setShowExceptionForm(false)
                      }}
                    >
                      Save Exception
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="border rounded-xl overflow-hidden">
                    <div className="max-h-[400px] overflow-y-auto">
                      <div className="space-y-px">
                        {existingDepartments.map((dept) => {
                          const deptPeople = people.filter(p => p.department === dept);
                          const headcount = deptPeople.length;
                          const basePoints = Number(automationForm.basePointsPerPerson) || 0;
                          const baseAllocation = basePoints * headcount;
                          const exceptions = departmentExceptions.filter(e => e.departmentId === dept);
                          const totalExceptions = exceptions.reduce((sum, e) => sum + e.points, 0);
                          const allocation = baseAllocation + totalExceptions;

                          return (
                            <div
                              key={dept}
                              className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
                            >
                              <div>
                                <div className="font-medium">{dept}</div>
                                <div className="text-sm text-gray-500">
                                  {headcount} people × {basePoints} points
                                  {exceptions.length > 0 && ` (${exceptions.length} exception${exceptions.length !== 1 ? 's' : ''})`}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-lg font-medium">
                                  {allocation.toLocaleString()} points
                                </div>
                                <button
                                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                  onClick={() => {
                                    const firstPerson = deptPeople[0];
                                    if (firstPerson) {
                                      setCurrentException({
                                        departmentId: dept,
                                        userId: firstPerson.id,
                                        points: 0
                                      });
                                      setShowExceptionForm(true);
                                    }
                                  }}
                                >
                                  {exceptions.length > 0 ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 5v14M5 12h14" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowExceptionForm(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )} {/* Closing tag for the Exception Form conditional rendering */}

      {/* Add Member Modal */}
      <div className={`fixed inset-0 flex items-center justify-center z-[100] transition-all duration-200 ${showAddMemberModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={handleCloseAddMemberModal}
        />
        <div className="relative w-full max-w-[calc(980px-3rem)] bg-white rounded-2xl shadow-xl mx-4 md:mx-6 transform transition-transform duration-200">
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {isEditMode ? 'Edit Member Details' : 'Add New Member'}
                </h2>
                {!isEditMode && (
                  <p className="text-sm text-gray-500 mt-1">Step {showInitialAllocation ? '2' : '1'} of 2</p>
                )}
              </div>
              <button 
                onClick={handleCloseAddMemberModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  Full Name
                </label>
                <Input
                  type="text"
                  placeholder="Enter member name"
                  className="h-11 text-lg"
                  value={newMember.name}
                  onChange={(e) => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  Department
                </label>
                <div className="relative department-dropdown">
                  <Input
                    type="text"
                    placeholder="Enter or select department"
                    className="h-11 text-lg"
                    value={newMember.department}
                    onChange={(e) => {
                      setNewMember(prev => ({ ...prev, department: e.target.value }));
                      setDepartmentSearchQuery(e.target.value);
                      setShowDepartmentDropdown(true);
                    }}
                    onFocus={() => setShowDepartmentDropdown(true)}
                  />
                  {showDepartmentDropdown && (
                    <div className="absolute w-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-lg overflow-hidden z-20">
                      <div className="max-h-[240px] overflow-y-auto">
                        {filteredDepartments.map((dept) => (
                          <div
                            key={dept}
                            className="px-4 py-3 hover:bg-[#F3F4F6] cursor-pointer"
                            onClick={() => handleDepartmentSelect(dept)}
                          >
                            {dept}
                          </div>
                        ))}
                        {departmentSearchQuery && !filteredDepartments.includes(departmentSearchQuery) && (
                          <div
                            className="px-4 py-3 hover:bg-[#F3F4F6] cursor-pointer text-accent"
                            onClick={() => handleDepartmentSelect(departmentSearchQuery)}
                          >
                            Create "{departmentSearchQuery}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex flex-col items-center p-4 border rounded-xl cursor-pointer transition-colors ${
                    newMember.role === 'user' ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-[#E5E7EB]'
                  }`}>
                    <input
                      type="radio"
                      name="role"
                      value="user"
                      checked={newMember.role === 'user'}
                      onChange={(e) => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                      className="sr-only"
                    />
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={newMember.role === 'user' ? 'text-blue-500' : 'text-gray-400'}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <div className="mt-2 text-center">
                      <div className="font-medium">Budget User</div>
                      <div className="text-xs text-gray-500 mt-1">Receive and manage budget</div>
                    </div>
                  </label>
                  <label className={`flex flex-col items-center p-4 border rounded-xl cursor-pointer transition-colors ${
                    newMember.role === 'manager' ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-[#E5E7EB]'
                  }`}>
                    <input
                      type="radio"
                      name="role"
                      value="manager"
                      checked={newMember.role === 'manager'}
                      onChange={(e) => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                      className="sr-only"
                    />
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={newMember.role === 'manager' ? 'text-blue-500' : 'text-gray-400'}>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <div className="mt-2 text-center">
                      <div className="font-medium">Budget Manager</div>
                      <div className="text-xs text-gray-500 mt-1">Allocate team budgets</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-8 mt-4 border-t">
              <Button 
                variant="outline" 
                className="flex-1 h-11"
                onClick={handleCloseAddMemberModal}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-accent hover:bg-accent/90 text-white h-11"
                onClick={() => {
                  if (editingMemberDetails && updatePerson) {
                    const updatedPerson = {
                      ...editingMemberDetails,
                      name: newMember.name,
                      department: newMember.department,
                      role: newMember.role
                    }
                    updatePerson(updatedPerson)
                    setIsSaved(true)
                    setTimeout(() => {
                      handleCloseAddMemberModal()
                      setIsSaved(false)
                    }, 1500)
                  } else {
                    createNewMember(newMember)
                    handleCloseAddMemberModal()
                  }
                }}
                disabled={!newMember.name || !newMember.department || !newMember.role}
              >
                {isEditMode ? 'Save Changes' : 'Add Member'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Request Modal */}
      <div 
        className={`fixed inset-0 flex items-center justify-center z-[100] transition-all duration-200 ${
          showRequestModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={() => setShowRequestModal(false)}
        />
        <div className="relative w-full max-w-[480px] bg-white rounded-2xl shadow-xl mx-4 md:mx-6 transform transition-transform duration-200">
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-semibold text-gray-900">Request Points</h2>
              <button 
                onClick={() => setShowRequestModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  Amount
                </label>
                <Input
                  type="number"
                  placeholder="Enter amount to request"
                  className="h-11 text-lg"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-8 mt-4 border-t">
              <Button 
                variant="outline" 
                className="flex-1 h-11"
                onClick={() => {
                  setShowRequestModal(false)
                  setRequestAmount('')
                }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-accent hover:bg-accent/90 text-white h-11"
                onClick={() => {
                  const amount = Number(requestAmount)
                  if (!isNaN(amount) && amount > 0) {
                    setPendingRequest({
                      requester: 'Morgan Freeman',
                      department: 'Legal Services',
                      amount: amount
                    });
                    setShowRequestModal(false)
                    setRequestAmount('')
                  }
                }}
                disabled={!requestAmount || isNaN(Number(requestAmount)) || Number(requestAmount) <= 0}
              >
                Send Request
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Prototyping Overlay */}
      <PrototypingOverlay 
        currentUser={currentUser}
        onUserChange={async (newUser: string) => {
          if (newUser === 'Morgan Freeman') {
            await handleMorganFreemanClick()
          } else if (newUser === 'Mhlengi Mntungwa') {
            await handleMhlengiMntungwaClick()
          }
        }}
        organizationType={organizationType}
        onOrganizationChange={handleOrganizationChange}
      />
    </div>
  )
}
