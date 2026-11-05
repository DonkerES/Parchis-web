import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game/game.gateway';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  providers: [GameService, GameGateway]
})
export class GameModule {}
