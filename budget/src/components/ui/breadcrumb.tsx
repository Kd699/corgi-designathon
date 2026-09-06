import { ChevronRight, Medal, X } from "lucide-react"
import { Badge } from "./badge"

// Type for the data associated with a Unit Pill
interface UnitData {
  name: string;
  location: string;
  storeManager: string;
  budgetManager: string;
}

// Props for a standard breadcrumb item
export interface BreadcrumbItemProps { // Re-exporting
  label: string
  icon?: React.ReactNode
  // isLast?: boolean      // isLast is calculated internally now
  // isActive?: boolean    // isActive styling handled internally now
  onClick?: () => void
  managerName?: string
  managerBudget?: number
  isUnitPill?: boolean
  unitData?: UnitData
}

// Union type for items the Breadcrumbs component can receive
export type ExtendedBreadcrumbItem =
  // Standard item requires a label
  (Omit<BreadcrumbItemProps, "isLast" | "isActive"> & { isUnitPill?: false; label: string; }) |
  // Unit pill item requires unitData and doesn't need a label
  {
    isUnitPill: true;
    unitData: UnitData;
    onClick?: () => void;
    // Ensure other potentially conflicting props aren't expected
    label?: never;
    icon?: never;
    managerName?: never;
    managerBudget?: never;
  };

interface BreadcrumbsProps {
  items: Array<ExtendedBreadcrumbItem> // Use the extended type
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="overflow-x-auto whitespace-nowrap scrollbar-none" onWheel={(e) => {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }}>
      <div className="flex items-center space-x-2 py-2 min-w-fit">
        {items.map((item, index) => {
          const isLastItem = index === items.length - 1;
          const itemKey = item.isUnitPill ? item.unitData.name : (item.label || 'item') + index;
          return (
            <div key={itemKey} className="flex items-center space-x-2">
              {item.isUnitPill && item.unitData ? (
                <div 
                  className={`flex items-center h-9 text-sm border rounded-lg transition-colors whitespace-nowrap bg-white text-gray-700 border-[#E5E7EB] hover:bg-gray-50 pl-3 pr-1.5`}
                >
                  <span className="font-medium pr-2">Units</span>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      item.onClick?.(); 
                    }} 
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label={`Clear unit filter`}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <div
                  className={`flex items-center h-9 space-x-2 px-4 py-2 rounded-lg cursor-pointer border transition-colors whitespace-nowrap ${
                    isLastItem ? 'bg-[#F3F4F6] text-blue-600 border-transparent' : 'bg-white text-gray-700 border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                  onClick={item.onClick}
                >
                  {item.icon && <span>{item.icon}</span>}
                  {item.label && <span className="text-sm font-medium">{item.label}</span>}
                  {item.managerName && typeof item.managerBudget === 'number' && (
                    <span className={`
                      ml-2 flex items-center text-sm px-2 py-0.5 rounded-md border 
                      ${isLastItem 
                        ? 'text-blue-600 border-blue-600 bg-blue-100' 
                        : 'text-gray-500 border-gray-300 bg-transparent'}
                    `}>
                      <span>{item.managerName}</span>
                      <span className={`mx-1 ${isLastItem ? 'text-blue-600' : 'text-gray-500'}`}>|</span> 
                      <Medal className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                      <span className="ml-1">{item.managerBudget.toLocaleString()}</span>
                    </span>
                  )}
                </div>
              )}
              {index < items.length - 1 && (
                <ChevronRight className="h-4 w-4 text-gray-400 stroke-2 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
} 