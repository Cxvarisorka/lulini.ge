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
    },
    ru: {
        ride_request_title: 'Новый заказ!',
        ride_request_body: 'Посадка: {{address}}',
        ride_accepted_title: 'Водитель найден!',
        ride_accepted_body: '{{driverName}} едет к вам',
        ride_arrived_title: 'Водитель прибыл!',
        ride_arrived_body: 'Ваш водитель на месте посадки',
        ride_started_title: 'Поездка началась',
        ride_started_body: 'Приятной поездки!',
        ride_completed_title: 'Поездка завершена',
        ride_completed_body: 'Стоимость: {{fare}} лари',
        ride_completed_driver_title: 'Поездка завершена',
        ride_completed_driver_body: 'Вы заработали {{fare}} лари',
        ride_cancelled_title: 'Поездка отменена',
        ride_cancelled_body: 'Ваша поездка была отменена',
        ride_cancelled_driver_title: 'Поездка отменена',
        ride_cancelled_driver_body: 'Поездка была отменена',
        ride_expired_title: 'Заказ истёк',
        ride_expired_body: 'Время ожидания истекло. Попробуйте ещё раз.',
        waiting_timeout_title: 'Поездка отменена',
        waiting_timeout_body: 'Пассажир не появился в течение 3 минут',
        waiting_timeout_passenger_title: 'Поездка отменена',
        waiting_timeout_passenger_body: 'Поездка отменена, так как вы не подошли к месту посадки в течение 3 минут',
        driver_approaching_pickup_title: 'Водитель рядом!',
        driver_approaching_pickup_body: 'Водитель прибудет примерно через {{minutes}} мин. Приготовьтесь!',
        driver_approaching_dropoff_title: 'Почти на месте!',
        driver_approaching_dropoff_body: 'До пункта назначения примерно {{minutes}} мин.',
    },
    es: {
        ride_request_title: '¡Nueva solicitud!',
        ride_request_body: 'Recogida: {{address}}',
        ride_accepted_title: '¡Conductor encontrado!',
        ride_accepted_body: '{{driverName}} está en camino',
        ride_arrived_title: '¡El conductor llegó!',
        ride_arrived_body: 'Tu conductor está en el punto de recogida',
        ride_started_title: 'Viaje iniciado',
        ride_started_body: '¡Disfruta tu viaje!',
        ride_completed_title: 'Viaje completado',
        ride_completed_body: 'Tarifa total: {{fare}} GEL',
        ride_completed_driver_title: 'Viaje completado',
        ride_completed_driver_body: 'Ganaste {{fare}} GEL',
        ride_cancelled_title: 'Viaje cancelado',
        ride_cancelled_body: 'Tu viaje ha sido cancelado',
        ride_cancelled_driver_title: 'Viaje cancelado',
        ride_cancelled_driver_body: 'El viaje ha sido cancelado',
        ride_expired_title: 'Solicitud expirada',
        ride_expired_body: 'Tu solicitud ha expirado. Inténtalo de nuevo.',
        waiting_timeout_title: 'Viaje cancelado',
        waiting_timeout_body: 'El pasajero no se presentó en 3 minutos',
        waiting_timeout_passenger_title: 'Viaje cancelado',
        waiting_timeout_passenger_body: 'El viaje fue cancelado porque no llegaste al punto de recogida en 3 minutos',
        driver_approaching_pickup_title: '¡El conductor está cerca!',
        driver_approaching_pickup_body: 'Tu conductor llegará en unos {{minutes}} min. ¡Prepárate!',
        driver_approaching_dropoff_title: '¡Casi llegas!',
        driver_approaching_dropoff_body: 'Llegarás a tu destino en unos {{minutes}} min.',
    }
};

/**
 * Get a localized push notification message
 * @param {string} lang - Language code (en, ka, ru, es)
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
