import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui/dialog';
import { Button } from './ui/button';

export function ConfirmationDialog({ isOpen, onClose, bookingData }) {
  const { t } = useTranslation();

  // Generate a random booking reference
  const bookingRef = `LUL${Date.now().toString(36).toUpperCase()}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-background" />
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">
            {t('confirmation.title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('confirmation.message')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-secondary rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t('confirmation.bookingRef')}
            </p>
            <p className="text-2xl font-mono font-bold mt-1">{bookingRef}</p>
          </div>

          {bookingData && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.from')}</span>
                <span className="font-medium text-right max-w-[60%] truncate">
                  {bookingData.pickupAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.to')}</span>
                <span className="font-medium text-right max-w-[60%] truncate">
                  {bookingData.dropoffAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.date')}</span>
                <span className="font-medium">
                  {bookingData.date} {bookingData.time}
                </span>
              </div>
              {bookingData.quote && (
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground">{t('common.total')}</span>
                  <span className="font-bold text-lg">${bookingData.quote.totalPrice}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <Button onClick={onClose} className="w-full">
          {t('confirmation.newBooking')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
