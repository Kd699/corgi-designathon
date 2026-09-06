tree: 2
1. src/App.tsx
  2. App
     * Purpose: This component serves as the central orchestrator for the entire budget management interface.
     * Usage: It renders the main layout, manages state for users, departments, budgets, and allocation rules. It conditionally displays different sections (like the user list, insights tab, allocation modals) based on user interactions and the selected context (e.g., current user, active department).
3. src/components/ui/button.tsx
  4. Button
     * Purpose: Provides interactive buttons for triggering actions within the budget application.
     * Usage: Examples include the main "Allocate" button opening the allocation modal, the "Add Member" button triggering the respective modal, the "Request" button (for Morgan Freeman), and internal buttons within modals like "Save", "Cancel", "Send", and switching transfer modes (Give/Reclaim).
  5. buttonVariants
     * Purpose: Defines the visual styles (like 'outline' or 'accent') and sizes for the `Button` component.
     * Usage: Ensures that all buttons, from the main action buttons to smaller icon buttons within lists or modals, maintain a consistent look and feel according to the application's design system, applying specific CSS classes based on props.
4. src/components/ui/breadcrumb.tsx
  5. Breadcrumbs
     * Purpose: Shows the current navigational hierarchy, reflecting the selected user context or organizational view.
     * Usage: Displays the path, such as "All Departments" or "Units > Bristol", adapting based on whether the organization is centralized/decentralized and if a specific unit or department head is selected. It allows clicking to navigate back up the hierarchy.
5. src/components/ui/card.tsx
  6. Card & related (Header, Footer, Title, Description, Content)
     * Purpose: These components structure visually distinct blocks of information.
     * Usage: `Card` is used implicitly by Shadcn UI components. While not directly used in `App.tsx` (`<Card>`), the structure is applied to elements like the main user info block at the top, modal dialogs (`Add Member`, `Allocate`), and potentially list items, organizing content like names, budgets, and actions.
6. src/components/PrototypingOverlay.tsx
  12. PrototypingOverlay
      * Purpose: Facilitates testing different user perspectives and organizational models without full authentication.
      * Usage: Renders buttons fixed at the bottom of the screen allowing the developer to instantly switch the view between 'Mhlengi Mntungwa' (admin) and 'Morgan Freeman' (manager), or toggle between 'centralized' and 'decentralized' views, updating the UI accordingly.
7. src/components/ui/badge.tsx
  13. Badge
      * Purpose: Displays concise status or role information visually.
      * Usage: Applied next to user/department names in the main list to show their role ('Budget Manager', 'Budget User', 'Unit') or potentially status (like 'Pending'). The `department` variant provides specific styling for roles within the list items.
  14. badgeVariants
      * Purpose: Defines the styling rules for different types of badges.
      * Usage: Ensures the 'department' badge variant used in the user list has the correct background and text color distinct from default badges, applying styles based on the `variant` prop.
8. src/components/NotificationButton.tsx
  15. NotificationButton
      * Purpose: Provides access to pending budget requests or other alerts.
      * Usage: Renders a bell icon in the header. When clicked, it shows a dropdown listing pending budget requests (like the one from Morgan Freeman), allowing the admin (Mhlengi) to view details and approve/reject them.
9. src/components/ui/input.tsx
  16. Input
      * Purpose: Captures user text input for various functions.
      * Usage: Used for the main search bar to filter people/departments/units, within modals for entering allocation amounts, defining new member names/departments, setting automation rule parameters (base points, name), and handling budget requests.
10. src/components/OnboardingModal.tsx
   17. OnboardingModal
       * Purpose: (Inferred) Presents an initial setup or feature introduction guide.
       * Usage: Likely triggered from the `PrototypingOverlay`'s settings menu (though the trigger logic might be simplified/removed in `App.tsx`), it would guide users through initial configurations or importing existing budget data.