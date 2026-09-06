import * as React from 'react'
import { Settings, Check, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { OnboardingModal } from './OnboardingModal'

interface PrototypingOverlayProps {
  className?: string;
  currentUser: string;
  onUserChange: (user: string) => void;
  organizationType?: 'centralized' | 'decentralized';
  onOrganizationChange?: (type: 'centralized' | 'decentralized') => void;
}

export function PrototypingOverlay({ 
  className, 
  currentUser, 
  onUserChange,
  organizationType = 'centralized',
  onOrganizationChange
}: PrototypingOverlayProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [activeMenu, setActiveMenu] = React.useState<'settings' | 'profile' | 'organization' | null>(null)
  const [showOnboarding, setShowOnboarding] = React.useState(false)
  const [localOrganizationType, setLocalOrganizationType] = React.useState<'centralized' | 'decentralized'>(organizationType)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Update local organization type when prop changes
  React.useEffect(() => {
    setLocalOrganizationType(organizationType)
  }, [organizationType])

  // Handle click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveMenu(null)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleUserChange = async (newUser: string) => {
    await onUserChange(newUser)
    setActiveMenu(null)
    setIsOpen(false)
    setShowOnboarding(false)
  }

  const handleOrganizationChange = (type: 'centralized' | 'decentralized') => {
    setLocalOrganizationType(type)
    if (onOrganizationChange) {
      onOrganizationChange(type)
    }
    setActiveMenu(null)
  }

  return (
    <>
      <div
        ref={menuRef}
        className={cn(
          'fixed bottom-4 right-4 flex flex-col items-end gap-2 z-50',
          className
        )}
      >
        {/* Settings Panel */}
        {isOpen && (
          <div className="mb-2 w-[320px] rounded-lg border bg-white/80 p-4 shadow-lg backdrop-blur-lg">
            <h3 className="mb-4 text-sm font-medium">Prototyping Settings</h3>
            <div className="space-y-2">
              {/* User Account Settings */}
              <div className="w-full rounded-xl border border-[#E5E7EB] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-700">{currentUser}</span>
                  </div>
                  <ChevronDown 
                    onClick={() => setActiveMenu(activeMenu === 'profile' ? null : 'profile')}
                    className={`h-4 w-4 text-gray-500 transition-transform cursor-pointer ${activeMenu === 'profile' ? 'rotate-180' : ''}`} 
                  />
                </div>

                {/* Profile Dropdown */}
                {activeMenu === 'profile' && (
                  <div className="mt-3 space-y-1">
                    <button 
                      className="w-full px-4 py-3 text-left hover:bg-[#F3F4F6] rounded-xl transition-colors flex items-center justify-between group"
                      onClick={() => handleUserChange('Mhlengi Mntungwa')}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-700">Mhlengi Mntungwa</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="department" className="bg-[#F3F4F6] text-gray-600 min-w-[120px] justify-center">Budget Admin</Badge>
                        <div className={`w-5 h-5 rounded border-2 ${currentUser === 'Mhlengi Mntungwa' ? 'border-blue-500 bg-blue-500' : 'border-gray-200'}`}>
                          {currentUser === 'Mhlengi Mntungwa' && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                    </button>

                    <button 
                      className="w-full px-4 py-3 text-left hover:bg-[#F3F4F6] rounded-xl transition-colors flex items-center justify-between group"
                      onClick={() => handleUserChange('Morgan Freeman')}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-700">Morgan Freeman</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="department" className="bg-[#F3F4F6] text-gray-600 min-w-[120px] justify-center">Budget Manager</Badge>
                        <div className={`w-5 h-5 rounded border-2 ${currentUser === 'Morgan Freeman' ? 'border-blue-500 bg-blue-500' : 'border-gray-200'}`}>
                          {currentUser === 'Morgan Freeman' && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Organization Structure Settings */}
              <div className="w-full rounded-xl border border-[#E5E7EB] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                      </svg>
                    </div>
                    <span className="text-sm text-gray-700">Organization Structure</span>
                  </div>
                  <ChevronDown 
                    onClick={() => setActiveMenu(activeMenu === 'organization' ? null : 'organization')}
                    className={`h-4 w-4 text-gray-500 transition-transform cursor-pointer ${activeMenu === 'organization' ? 'rotate-180' : ''}`} 
                  />
                </div>

                {/* Organization Dropdown */}
                {activeMenu === 'organization' && (
                  <div className="mt-3 space-y-1">
                    <button 
                      className="w-full px-4 py-3 text-left hover:bg-[#F3F4F6] rounded-xl transition-colors flex items-center justify-between group"
                      onClick={() => handleOrganizationChange('centralized')}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-700">Centralized</div>
                        <p className="text-xs text-gray-500">One company manages all departments under a unified structure.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 ${localOrganizationType === 'centralized' ? 'border-blue-500 bg-blue-500' : 'border-gray-200'}`}>
                          {localOrganizationType === 'centralized' && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                    </button>

                    <button 
                      className="w-full px-4 py-3 text-left hover:bg-[#F3F4F6] rounded-xl transition-colors flex items-center justify-between group"
                      onClick={() => handleOrganizationChange('decentralized')}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-700">Decentralized</div>
                        <p className="text-xs text-gray-500">Multiple units (e.g., stores) operate independently, each with their own departments.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 ${localOrganizationType === 'decentralized' ? 'border-blue-500 bg-blue-500' : 'border-gray-200'}`}>
                          {localOrganizationType === 'decentralized' && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Onboarding Option */}
              <button
                className="w-full rounded-md bg-gray-100/80 px-3 py-2 text-left text-sm hover:bg-gray-200/80"
                onClick={() => {
                  setShowOnboarding(true)
                  setIsOpen(false)
                  setActiveMenu(null)
                }}
              >
                Onboarding
              </button>
            </div>
          </div>
        )}

        {/* Settings Button */}
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full bg-blue-500/20 backdrop-blur-sm hover:bg-blue-500/30"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Settings className="h-6 w-6 text-blue-600" />
        </Button>
      </div>

      <OnboardingModal 
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </>
  )
} 