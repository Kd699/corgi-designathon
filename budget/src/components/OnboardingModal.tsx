import * as React from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Download, Upload, X } from 'lucide-react'
import { Badge } from './ui/badge'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

const SAMPLE_USERS = [
  // Budget Managers (reduced by 50%)
  { 
    firstName: 'Morgan',
    lastName: 'Freeman',
    department: 'Legal Services',
    role: 'Budget Manager',
    budget: 100
  },
  { 
    firstName: 'Brad',
    lastName: 'Pitt',
    department: 'Policy and Strategy',
    role: 'Budget Manager',
    budget: 0
  },
  { 
    firstName: 'Angelina',
    lastName: 'Jolie',
    department: 'Finance',
    role: 'Budget Manager',
    budget: 0
  },
  
  // Budget Users (Legal Services Team - reduced by 50%)
  { 
    firstName: 'Andrea',
    lastName: 'Bocelli',
    team: 'Legal Services',
    role: 'Budget User',
    budget: 800000
  },
  { 
    firstName: 'Yo-Yo',
    lastName: 'Ma',
    team: 'Legal Services',
    role: 'Budget User',
    budget: 700000
  },
  { 
    firstName: 'Lang',
    lastName: 'Lang',
    team: 'Legal Services',
    role: 'Budget User',
    budget: 600000
  },
  { 
    firstName: 'Joshua',
    lastName: 'Bell',
    team: 'Legal Services',
    role: 'Budget User',
    budget: 400000
  }
]

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  // Format sample users with additional data
  const formattedPeople = SAMPLE_USERS.map(person => ({
    ...person,
    email: `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase()}@generalreletivity.com`,
    externalId: `GR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    // Use department for managers, team for users
    displayTeam: person.role === 'Budget Manager' ? person.department : person.team
  }))

  const handleDownloadTemplate = () => {
    const headers = ['First Name', 'Last Name', 'Email Address', 'Team', 'Role', 'External ID']
    const csvContent = [
      headers.join(','),
      ...formattedPeople.map(person => 
        [person.firstName, person.lastName, person.email, person.displayTeam, person.role, person.externalId].join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.setAttribute('hidden', '')
    a.setAttribute('href', url)
    a.setAttribute('download', 'budget_team_template.csv')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[980px] mx-4 md:mx-6">
        <div className="flex flex-col max-h-[80vh]">
          <div className="border-b p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create a Budget</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Import your team structure below. Budget Managers oversee departments while Budget Users belong to specific teams.
                </p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button
                variant="outline"
                className="h-11"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Download structure
              </Button>
              <Button className="h-11 bg-blue-500 hover:bg-blue-600 text-white">
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button variant="outline" className="h-11">
                Import from Perkbox
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">First Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">Last Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">Email Address</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">Team</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">Role</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">External ID</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">Budget</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formattedPeople.map((person) => (
                    <tr key={person.externalId} className="hover:bg-gray-50">
                      <td className="py-3 px-4">{person.firstName}</td>
                      <td className="py-3 px-4">{person.lastName}</td>
                      <td className="py-3 px-4 text-gray-500">{person.email}</td>
                      <td className="py-3 px-4">
                        <Badge 
                          variant="department" 
                          className={`${
                            person.role === 'Budget Manager' 
                              ? 'bg-purple-50 text-purple-700' 
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {person.displayTeam}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge 
                          variant="department" 
                          className={`${
                            person.role === 'Budget Manager' 
                              ? 'bg-purple-50 text-purple-700' 
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {person.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-gray-500">{person.externalId}</td>
                      <td className="py-3 px-4 text-right">
                        {person.budget.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t p-6 flex justify-end">
            <Button 
              className="h-11 bg-blue-500 hover:bg-blue-600 text-white px-8"
              onClick={onClose}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 