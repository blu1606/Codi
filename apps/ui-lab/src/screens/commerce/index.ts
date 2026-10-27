import type { Screen } from "../screen-types";
import { cartScreen } from "./s05-cart";
import { adminVouchersScreen } from "./s35-admin-vouchers";
import { landingScreen } from "./s00-landing";
import { coursesScreen } from "./s01-courses";
import { courseDetailScreen } from "./s02-course-detail";
import { signInModalScreen } from "./s03-sign-in-modal";
import { authPagesScreen } from "./s04-auth-pages";
import { settingsScreen, profileScreen } from "./s04b-account";
import { checkoutScreen } from "./s06-checkout";
import { checkoutSuccessScreen } from "./s07-checkout-success";
import { learnerStatsScreen } from "./s13b-learner-stats";
import { aiAdvisorScreen } from "./s17-ai-advisor";
import { adminDashboardScreen } from "./s30-admin-dashboard";
import { adminUsersScreen } from "./s31-admin-users";
import { adminCoursesScreen } from "./s33-admin-courses";
import { adminOrdersScreen } from "./s34-admin-orders";
import { adminInsightsScreen } from "./s36-admin-insights";
import { adminFinanceScreen } from "./s37-admin-finance";
import { headerScreen } from "./s40-s41-header";

export const commerceScreens: Screen[] = [
  landingScreen, coursesScreen, courseDetailScreen, signInModalScreen, authPagesScreen,
  settingsScreen, profileScreen, cartScreen, checkoutScreen, checkoutSuccessScreen,
  aiAdvisorScreen, learnerStatsScreen, headerScreen,
  adminDashboardScreen, adminUsersScreen, adminCoursesScreen, adminOrdersScreen, adminVouchersScreen,
  adminInsightsScreen, adminFinanceScreen,
];
