const messages = {
    en: {
        ride_request_title: 'New Ride Request!',
        ride_request_body: 'Pickup: {{address}}',
        ride_accepted_title: 'Driver Found!',
        ride_accepted_body: '{{driverName}} is on the way to pick you up',
        ride_arrived_title: 'Driver Arrived!',
        ride_arrived_body: 'Your driver has arrived at the pickup location',
        ride_started_title: 'Ride Started',
        ride_started_body: 'Enjoy your ride!',
        ride_completed_title: 'Ride Completed',
        ride_completed_body: 'Total fare: {{fare}} GEL',
        ride_completed_driver_title: 'Ride Completed',
        ride_completed_driver_body: 'You earned {{fare}} GEL',
        ride_cancelled_title: 'Ride Cancelled',
        ride_cancelled_body: 'Your ride has been cancelled',
        ride_cancelled_driver_title: 'Ride Cancelled',
        ride_cancelled_driver_body: 'The ride has been cancelled',
        ride_expired_title: 'Ride Expired',
        ride_expired_body: 'Your ride request has expired. Please try again.',
        waiting_timeout_title: 'Ride Cancelled',
        waiting_timeout_body: 'Passenger did not show up within 3 minutes',
        waiting_timeout_passenger_title: 'Ride Cancelled',
        waiting_timeout_passenger_body: 'The ride was cancelled because you didn\'t arrive at the pickup point within 3 minutes',
        driver_approaching_pickup_title: 'Driver is Nearby!',
        driver_approaching_pickup_body: 'Your driver will arrive in about {{minutes}} min. Get ready!',
        driver_approaching_dropoff_title: 'Almost There!',
        driver_approaching_dropoff_body: 'You will arrive at your destination in about {{minutes}} min.',
        sos_alert_title: 'SOS Emergency Alert',
        sos_alert_body: '{{userName}} needs help! Open Lulini for their location.',
        driver_approved_title: 'Account Approved!',
        driver_approved_body: 'Your driver account has been approved. You can now start accepting rides!',
        driver_rejected_title: 'Registration Update',
        driver_rejected_body: 'Your driver registration was not approved. Please contact support for details.',
    },
    ka: {
        ride_request_title: 'ახალი მოთხოვნა!',
        ride_request_body: 'აყვანა: {{address}}',
        ride_accepted_title: 'მძღოლი ნაპოვნია!',
        ride_accepted_body: '{{driverName}} მოემართება თქვენკენ',
        ride_arrived_title: 'მძღოლი ჩამოვიდა!',
        ride_arrived_body: 'თქვენი მძღოლი ადგილზეა',
        ride_started_title: 'მგზავრობა დაიწყო',
        ride_started_body: 'ისიამოვნეთ მგზავრობით!',
        ride_completed_title: 'მგზავრობა დასრულდა',
        ride_completed_body: 'საფასური: {{fare}} ლარი',
        ride_completed_driver_title: 'მგზავრობა დასრულდა',
        ride_completed_driver_body: 'თქვენ მიიღეთ {{fare}} ლარი',
        ride_cancelled_title: 'მგზავრობა გაუქმდა',
        ride_cancelled_body: 'თქვენი მგზავრობა გაუქმდა',
        ride_cancelled_driver_title: 'მგზავრობა გაუქმდა',
        ride_cancelled_driver_body: 'მგზავრობა გაუქმდა',
        ride_expired_title: 'მოთხოვნის ვადა ამოიწურა',
        ride_expired_body: 'თქვენი მოთხოვნის ვადა ამოიწურა. გთხოვთ სცადოთ ხელახლა.',
        waiting_timeout_title: 'მგზავრობა გაუქმდა',
        waiting_timeout_body: 'მგზავრი 3 წუთის განმავლობაში არ გამოცხადდა',
        waiting_timeout_passenger_title: 'მგზავრობა გაუქმდა',
        waiting_timeout_passenger_body: 'მგზავრობა გაუქმდა, რადგან 3 წუთის განმავლობაში ვერ მოხვედით აყვანის ადგილზე',
        driver_approaching_pickup_title: 'მძღოლი ახლოს არის!',
        driver_approaching_pickup_body: 'მძღოლი დაახლოებით {{minutes}} წუთში ჩავა. მოემზადეთ!',
        driver_approaching_dropoff_title: 'თითქმის მიხვედით!',
        driver_approaching_dropoff_body: 'დანიშნულების ადგილამდე დაახლოებით {{minutes}} წუთი დარჩა.',
        sos_alert_title: 'SOS საგანგებო გაფრთხილება',
        sos_alert_body: '{{userName}}-ს დახმარება სჭირდება! გახსენით Lulini დეტალებისთვის.',
        driver_approved_title: 'ანგარიში დამტკიცებულია!',
        driver_approved_body: 'თქვენი მძღოლის ანგარიში დამტკიცდა. შეგიძლიათ დაიწყოთ მგზავრობების მიღება!',
        driver_rejected_title: 'რეგისტრაციის განახლება',
        driver_rejected_body: 'თქვენი მძღოლის რეგისტრაცია არ იქნა დამტკიცებული. დაუკავშირდით მხარდაჭერას დეტალებისთვის.',
    },
    // Only English and Georgian are supported
};

/**
 * Get a localized push notification message
 * @param {string} lang - Language code (en, ka)
 * @param {string} key - Message key (e.g. 'ride_accepted_title')
 * @param {object} params - Template parameters (e.g. { driverName: 'John' })
 * @returns {string}
 */
function getMessage(lang, key, params = {}) {
    const langMessages = messages[lang] || messages['ka'];
    let text = langMessages[key] || messages['en'][key] || key;

    for (const [param, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{${param}}}`, 'g'), value);
    }

    return text;
}

module.exports = { getMessage };
